import type { PoolClient } from 'pg';
import type { SyncMode } from '../../../../shared/domain';
import { env } from '../../config/env';
import { emptyDatabase, isEmptyDatabase, type Database } from '../database';
import type {
  CommitResult,
  Store,
  StoreHealth,
  StoreOptions,
  TableSyncResult,
} from '../store';
import type { SheetsMirror } from '../sheets/mirror';
import { describeDatabase, getPool } from './pool';
import {
  TABLE_SPECS,
  columnList,
  metaToRecord,
  metaToRow,
  settingsToRecord,
  settingsToRow,
  toRecord,
  toValues,
  type DatasetName,
  type TableSpec,
} from './rows';

type Row = Record<string, unknown>;

/** Query handle shared by the write helpers. PoolClient and Pool both fit. */
type Querier = { query: (sql: string, values?: unknown[]) => Promise<unknown> };

/** Postgres allows 65535 bind parameters; keep well under it per statement. */
const BATCH_ROWS = 400;

/**
 * The one lock that orders every write in the shop.
 *
 * Taken inside the transaction, so it is released by the commit or the rollback
 * and can never be left held by a crashed request. Two phones saving at the same
 * instant take turns instead of both reading the same counter and handing out the
 * same bill number.
 */
const WRITE_LOCK_KEY = 728_140_001;

function datasetRows(db: Database, spec: TableSpec): Row[] {
  return db[spec.dataset] as unknown as Row[];
}

/**
 * The sync screen names tables the way the Google spreadsheet did ("Orders",
 * "Stock Movements"), while the rest of the code uses the field name
 * (stockMovements). Both are accepted so the same call works either way.
 */
const SHEET_NAMES: Record<string, DatasetName> = {
  Customers: 'customers',
  Orders: 'orders',
  Payments: 'payments',
  Parts: 'parts',
  'Order Parts': 'orderParts',
  'Stock Movements': 'stockMovements',
  Suppliers: 'suppliers',
  'Status History': 'statusHistory',
};

function specFor(tableKey: string): TableSpec | undefined {
  const dataset = (SHEET_NAMES[tableKey] ?? tableKey) as DatasetName;
  return TABLE_SPECS.find((spec) => spec.dataset === dataset);
}

/** The tab name a dataset is mirrored into, for the Sheets copy. */
function sheetForDataset(dataset: DatasetName): string {
  const entry = Object.entries(SHEET_NAMES).find(([, value]) => value === dataset);
  return entry ? entry[0] : '';
}

/**
 * The online store. Bills live in Postgres, so two phones on the same counter
 * see the same number, and a bill survives the shop PC being switched off.
 *
 * How it works, and why: the whole shop is read into memory at boot, because
 * every screen in the app asks questions like "how much came in today" that span
 * several tables, and the app already works that way. A write therefore takes
 * the shape the rest of the code expects - a mutator over a draft - and this
 * store works out afterwards which rows actually changed and sends only those.
 *
 * The important difference from the local file: the write reaches the database
 * first and memory is updated second. If the database refuses the write, the
 * request fails and nothing is quietly kept only on this computer.
 *
 * Two things make more than one device safe, and both are about the order of
 * operations rather than about the SQL:
 *
 *   * Every write takes one shop-wide lock, then re-reads the rows it is about
 *     to change from inside its own transaction. Writing from the in-memory
 *     copy instead would be a lost update the moment two phones save at once -
 *     the second save would carry the first phone's numbers back over the top.
 *   * The snapshot on its own is refreshed on a timer, so a screen left open on
 *     the counter shows what the other phone has written.
 */
export class PostgresStore implements Store {
  readonly mode: SyncMode = 'postgres';

  private db: Database = emptyDatabase();
  private mirror: SheetsMirror | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private refreshing = false;
  /**
   * Bumped by every write. A background refresh that started before a write and
   * finished after it must not put the older rows back, so a refresh only adopts
   * what it read if the counter has not moved underneath it.
   */
  private writeSeq = 0;

  async init(): Promise<void> {
    // Fail here rather than at the first bill. A shop that starts up and only
    // discovers the database is gone at closing time has already lost a day.
    const client = await getPool().connect();
    try {
      await client.query('select 1');
    } finally {
      client.release();
    }
    this.db = await this.load();
    this.startRefreshing();
  }

  /** Attaches the optional one way copy into Google Sheets. */
  attachMirror(mirror: SheetsMirror | null): void {
    this.mirror = mirror;
  }

  hasMirror(): boolean {
    return this.mirror !== null;
  }

  mirrorLocation(): string {
    return this.mirror?.location() ?? '';
  }

  mirrorPendingCount(): number {
    return this.mirror?.pendingCount() ?? 0;
  }

  mirrorError(): string {
    return this.mirror?.lastError() ?? '';
  }

  /**
   * Re-reads the whole shop in the background.
   *
   * Every screen asks questions spanning several tables, so this reads all of
   * them together. A failure is ignored rather than thrown: the last good
   * snapshot is still better than an empty one, and the health check reports the
   * database separately.
   */
  private startRefreshing(): void {
    if (this.timer || !env.database.refreshMs) return;
    this.timer = setInterval(() => {
      void this.refresh();
    }, env.database.refreshMs);
    // Never hold the process open just to poll the database.
    this.timer.unref?.();
  }

  async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    const seq = this.writeSeq;
    try {
      const fresh = await this.load();
      if (seq === this.writeSeq) this.db = fresh;
    } catch (error) {
      console.error('[db] refresh failed, keeping the last good copy:', error instanceof Error ? error.message : error);
    } finally {
      this.refreshing = false;
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Reads the whole shop.
   *
   * Given a client it reads inside that client's transaction, which is how a
   * write sees its own uncommitted state and every other writer's finished one.
   * Given nothing it takes a connection of its own and reads in a repeatable
   * read transaction, so a background refresh cannot return half of one write
   * and half of another.
   */
  private async load(client?: PoolClient): Promise<Database> {
    const read = async (q: PoolClient): Promise<Database> => {
      const db = emptyDatabase();
      for (const spec of TABLE_SPECS) {
        const { rows } = await q.query(`select ${columnList(spec).join(', ')} from ${spec.table}`);
        (db[spec.dataset] as unknown) = rows.map((row) => toRecord(spec, row as Row));
      }
      const settings = await q.query('select * from settings where id = 1');
      if (settings.rows[0]) db.settings = settingsToRecord(settings.rows[0] as Row);
      const meta = await q.query('select * from meta where id = 1');
      if (meta.rows[0]) db.meta = metaToRecord(meta.rows[0] as Row);
      return db;
    };

    if (client) return read(client);

    const pooled = await getPool().connect();
    try {
      await pooled.query('begin isolation level repeatable read read only');
      try {
        const db = await read(pooled);
        await pooled.query('commit');
        return db;
      } catch (error) {
        await pooled.query('rollback').catch(() => undefined);
        throw error;
      }
    } finally {
      pooled.release();
    }
  }

  snapshot(): Database {
    return this.db;
  }

  async commit<T>(mutate: (draft: Database) => T, options?: StoreOptions): Promise<T> {
    const result = await this.commitChecked(mutate, options);
    return result.value;
  }

  /**
   * Saves a change and then tries to copy it into the spreadsheet.
   *
   * The two steps are deliberately separate. A bill that is in the database is a
   * bill; a bill that is also in the sheet is a bill somebody can read in Excel.
   * If the sheet is down, `synced` is false and the caller is told, but the bill
   * stays saved and the copy is retried.
   */
  async commitChecked<T>(mutate: (draft: Database) => T, options?: StoreOptions): Promise<CommitResult<T>> {
    const seq = this.writeSeq;
    const { result, snapshot, changedSheets } = await this.persist(mutate);
    // Only adopt the snapshot if no other write finished first. When two saves
    // overlap, the one that committed last read the other's result, so its
    // snapshot is the complete one and this leaves the right one in place.
    if (seq === this.writeSeq) this.db = snapshot;
    this.writeSeq += 1;

    if (!this.mirror || changedSheets.length === 0) {
      return { value: result, synced: true };
    }

    const ok = await this.mirror.push(this.db, changedSheets);
    if (ok) return { value: result, synced: true };
    return {
      value: result,
      synced: false,
      warning: {
        code: 'SHEETS_PENDING',
        message:
          'Saved in the online database. The Google Sheets copy is behind and will be retried.',
      },
    };
  }

  /**
   * Runs a change as one locked, freshly read transaction.
   *
   * Lock, read, change, write, commit - in that order. Reading before the change
   * and while holding the lock is what makes the sequence and the bill amounts
   * correct when two devices save together: whoever is second reads the first
   * one's result instead of the copy it happened to be holding.
   */
  private async persist<T>(
    mutate: (draft: Database) => T,
  ): Promise<{ result: T; snapshot: Database; changedSheets: string[] }> {
    const client = await getPool().connect();
    try {
      await client.query('begin');
      try {
        await client.query('select pg_advisory_xact_lock($1)', [WRITE_LOCK_KEY]);
        const before = await this.load(client);
        const draft: Database = structuredClone(before);
        const result = mutate(draft);

        const changedSheets: string[] = [];
        for (const spec of TABLE_SPECS) {
          const { changed, removed } = this.diff(
            spec,
            datasetRows(before, spec),
            datasetRows(draft, spec),
          );
          if (changed.length === 0 && removed.length === 0) continue;
          await this.upsertRows(client, spec, changed);
          await this.deleteRows(client, spec, removed);
          const sheet = sheetForDataset(spec.dataset);
          if (sheet) changedSheets.push(sheet);
        }

        const settingsChanged = await this.writeSettings(client, before, draft);
        await this.writeMeta(client, before, draft);
        if (settingsChanged) changedSheets.push('Settings');

        await client.query('commit');
        return { result, snapshot: draft, changedSheets };
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      }
    } finally {
      client.release();
    }
  }

  /**
   * Which rows were added or edited, and which are gone.
   *
   * Compared on the encoded values rather than the raw objects, so a field the
   * database would store identically does not count as a change.
   */
  private diff(
    spec: TableSpec,
    before: Row[],
    after: Row[],
  ): { changed: unknown[][]; removed: string[] } {
    const beforeByKey = new Map<string, unknown[]>();
    for (const record of before) {
      beforeByKey.set(String(record[spec.key] ?? ''), toValues(spec, record));
    }
    const afterByKey = new Map<string, unknown[]>();
    const changed: unknown[][] = [];
    for (const record of after) {
      const key = String(record[spec.key] ?? '');
      const values = toValues(spec, record);
      afterByKey.set(key, values);
      const previous = beforeByKey.get(key);
      if (previous === undefined || JSON.stringify(previous) !== JSON.stringify(values)) {
        changed.push(values);
      }
    }
    const removed: string[] = [];
    for (const [key] of beforeByKey) {
      if (!afterByKey.has(key)) removed.push(key);
    }
    return { changed, removed };
  }

  private async upsertRows(client: Querier, spec: TableSpec, rows: unknown[][]): Promise<void> {
    if (rows.length === 0) return;
    const columns = columnList(spec);
    const updates = columns
      .filter((column) => column !== spec.key)
      .map((column) => `${column} = excluded.${column}`)
      .join(', ');

    for (let start = 0; start < rows.length; start += BATCH_ROWS) {
      const batch = rows.slice(start, start + BATCH_ROWS);
      const placeholders = batch.map((_, rowIndex) => {
        const offset = rowIndex * columns.length;
        return `(${columns.map((__, columnIndex) => `$${offset + columnIndex + 1}`).join(', ')})`;
      });
      const values = batch.flat();
      const sql =
        `insert into ${spec.table} (${columns.join(', ')}) values ${placeholders.join(', ')}` +
        ` on conflict (${spec.key}) do update set ${updates}`;
      await client.query(sql, values);
    }
  }

  private async deleteRows(client: Querier, spec: TableSpec, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    // Deleted by key in one statement. The parent tables come first in
    // TABLE_SPECS, so ON DELETE CASCADE has already tidied the children up by
    // the time their own turn comes, and deleting a missing row is a no-op.
    await client.query(`delete from ${spec.table} where ${spec.key} = any($1::text[])`, [keys]);
  }

  private async writeSettings(client: Querier, before: Database, after: Database): Promise<boolean> {
    const previous = settingsToRow(before.settings);
    const next = settingsToRow(after.settings);
    if (JSON.stringify(previous) === JSON.stringify(next)) return false;
    const columns = Object.keys(next);
    const assignments = columns.map((column, index) => `${column} = $${index + 2}`);
    await client.query(
      `update settings set ${assignments.join(', ')} where id = 1`,
      [1, ...columns.map((column) => next[column])],
    );
    return true;
  }

  /** The bill number counter lives here, so it is written with everything else. */
  private async writeMeta(client: Querier, before: Database, after: Database): Promise<void> {
    const previous = metaToRow(before.meta);
    const next = metaToRow(after.meta);
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    const columns = Object.keys(next);
    const assignments = columns.map((column, index) => `${column} = $${index + 2}`);
    await client.query(
      `update meta set ${assignments.join(', ')} where id = 1`,
      [1, ...columns.map((column) => next[column])],
    );
  }

  async health(): Promise<StoreHealth> {
    try {
      const client = await getPool().connect();
      try {
        const { rows } = await client.query('select count(*)::int as count from orders');
        const count = Number((rows[0] as { count: number }).count);
        return {
          ok: true,
          mode: this.mode,
          message: isEmptyDatabase(this.db) ? 'Connected - no bills yet' : `Connected - ${count} bills stored`,
          detail: describeDatabase(),
        };
      } finally {
        client.release();
      }
    } catch (error) {
      return {
        ok: false,
        mode: this.mode,
        message: 'The online store cannot be reached',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  location(): string {
    return describeDatabase();
  }

  /**
   * How many tabs are still behind in the Google Sheets copy.
   *
   * Zero when no sheet is connected, which is the normal case: the database
   * holds everything and there is nothing queued anywhere.
   */
  pendingSyncCount(): number {
    return this.mirror?.pendingCount() ?? 0;
  }

  /** Retries the Google Sheets copy. Never throws: it is a copy, not the data. */
  async flushPending(): Promise<{ pushed: number; failed: number }> {
    if (!this.mirror) return { pushed: 0, failed: 0 };
    const before = this.mirror.pendingCount();
    const ok = await this.mirror.flush();
    if (ok) return { pushed: before, failed: 0 };
    return { pushed: before - this.mirror.pendingCount(), failed: this.mirror.pendingCount() };
  }

  /**
   * Not available, and this is not an oversight.
   *
   * The spreadsheet is a copy of the shop's records, not a second place to keep
   * them. Reading rows out of it and writing them into the database would mean a
   * bill amount, a payment or a stock figure could be changed by editing a cell
   * in a browser, with nothing recording that it happened. Editing stays in the
   * app, where it is checked and logged.
   */
  async syncFromSource(tableKey: string): Promise<TableSyncResult> {
    const label = SHEET_NAMES[tableKey] ? tableKey : 'The spreadsheet';
    return {
      created: 0,
      updated: 0,
      unchanged: 0,
      conflicts: 0,
      details: [
        `${label} is a copy of the online database and cannot be imported from. Make the change in the app.`,
      ],
    };
  }

  /**
   * "Push" now means "copy to the sheet", not "save to the database": with the
   * database as the store, every change is already saved by the time anyone asks
   * to push. With a sheet connected it re-sends that tab so the owner can pull
   * the spreadsheet level up by hand.
   */
  async syncToSource(tableKey: string): Promise<{ pushed: number; details: string[] }> {
    if (!this.mirror) return { pushed: 0, details: [] };
    // Settings is a single row rather than a table, so it is written by name
    // rather than through a TableSpec. Without this the button that copies the
    // shop's own details across reports an unknown table.
    if (tableKey.toLowerCase() === 'settings') {
      await this.mirror.push(this.db, ['Settings']);
      return { pushed: 1, details: ['1 row sent to the Settings sheet.'] };
    }
    const spec = specFor(tableKey);
    if (!spec) return { pushed: 0, details: [`Unknown table: ${tableKey}`] };
    const rows = datasetRows(this.db, spec);
    const sheet = sheetForDataset(spec.dataset);
    if (!sheet) return { pushed: 0, details: [] };
    await this.mirror.push(this.db, [sheet]);
    return {
      pushed: rows.length,
      details: [`${rows.length} row${rows.length === 1 ? '' : 's'} sent to the ${sheet} sheet.`],
    };
  }

  /**
   * Nothing to do. The tables are created once by `npm run db:setup` using an
   * administrator connection, and the role the app runs as is not allowed to
   * change the structure - so a compromised server cannot drop a table.
   */
  async bootstrap(): Promise<{ created: string[]; spreadsheetId: string }> {
    return { created: [], spreadsheetId: this.mirror?.location() ?? '' };
  }
}

export type { DatasetName };
