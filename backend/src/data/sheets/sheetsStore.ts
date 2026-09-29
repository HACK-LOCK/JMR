import fsp from 'node:fs/promises';
import path from 'node:path';
import type { sheets_v4 } from 'googleapis';
import type { SyncMode } from '../../../../shared/domain';
import { env } from '../../config/env';
import { getClients, isGoogleReady, spreadsheetUrl, withRetry } from '../../google/client';
import { emptyDatabase, type Database } from '../database';
import type {
  CommitResult,
  Store,
  StoreHealth,
  StoreOptions,
  TableSyncResult,
} from '../store';
import {
  ALL_TABLES,
  asConsumeMode,
  asPaymentMode,
  recordToRow,
  rowToRecord,
  SETTINGS_COLUMNS,
  SETTINGS_FIELD_BY_HEADER,
  type TableDef,
} from './sheetSchema';

type Row = Record<string, unknown>;
type TableKey = string;

const DATA_START_ROW = 2; // row 1 is the bold header

function colLetter(index: number): string {
  let n = index;
  let out = '';
  while (n >= 0) {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  }
  return out;
}

function quote(sheet: string): string {
  return `'${sheet.replace(/'/g, "''")}'`;
}

function rangeOf(sheet: string, row: number, columns: number): string {
  return `${quote(sheet)}!A${row}:${colLetter(columns - 1)}${row}`;
}

function parseStartRow(updatedRange: string | undefined, fallback: number): number {
  if (!updatedRange) return fallback;
  const match = /!A(\d+)/.exec(updatedRange);
  return match?.[1] ? Number(match[1]) : fallback;
}

function isoOrEmpty(value: unknown): string {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    if (value.trim() === '') return '';
  }
  return '';
}

function isNewer(candidate: string, reference: string): boolean {
  if (!candidate) return false;
  if (!reference) return true;
  return Date.parse(candidate) > Date.parse(reference);
}

/**
 * Google Sheets adapter.
 *
 * Sheets is treated as a MIRROR of the app database, not as a random-access
 * database. The whole workbook is cached in memory; writes are diffed and only
 * the touched rows are sent back, addressed by their stable id. If Google is
 * unreachable the change is still applied locally, flagged as pending, backed
 * up to disk and retried later - the employee never loses work and never sees a
 * false "saved".
 */
export class GoogleSheetsStore implements Store {
  readonly mode: SyncMode = 'sheets';

  private db: Database = emptyDatabase();
  private queue: Promise<unknown> = Promise.resolve();
  private rowIndex = new Map<TableKey, Map<string, number>>();
  private gridRows = new Map<TableKey, number>();
  private dirty = new Set<TableKey>();
  private settingsDirty = false;
  private lastError = '';
  private settingsRow: Row = {};

  private readonly backupFile: string;
  readonly spreadsheetId: string;

  constructor(spreadsheetId: string) {
    this.spreadsheetId = spreadsheetId;
    this.backupFile = path.join(env.dataDir, 'pending-google-backup.json');
  }

  /* ----------------------------- lifecycle ----------------------------- */

  async init(): Promise<void> {
    await fsp.mkdir(env.dataDir, { recursive: true });
    const { sheets, spreadsheetId } = await getClients(this.spreadsheetId);
    const meta = await withRetry('read spreadsheet', () =>
      sheets.spreadsheets.get({ spreadsheetId }),
    );
    const existing = new Map(
      (meta.data.sheets ?? []).map((sheet) => [sheet.properties?.title ?? '', sheet]),
    );
    const lastCol = colLetter(30);
    const created: sheets_v4.Schema$Sheet[] = [];

    for (const table of ALL_TABLES) {
      if (!existing.has(table.sheet)) {
        const added = await withRetry(`create tab ${table.sheet}`, () =>
          sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [{ addSheet: { properties: { title: table.sheet } } }],
            },
          }),
        );
        const sheet = added.data.replies?.[0]?.addSheet?.properties;
        if (sheet) created.push({ properties: sheet });
        existing.set(table.sheet, { properties: sheet ?? { title: table.sheet, gridProperties: { rowCount: 1000 } } });
      }
      const grid = existing.get(table.sheet)?.properties?.gridProperties?.rowCount ?? 1000;
      this.gridRows.set(table.sheet, grid);
      this.rowIndex.set(table.sheet, new Map());
      await this.writeHeaders(sheets, spreadsheetId, table.sheet, table.columns.map((c) => c.header), lastCol);
    }

    if (!existing.has('Settings')) {
      const added = await withRetry('create tab Settings', () =>
        sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ addSheet: { properties: { title: 'Settings' } } }] },
        }),
      );
      const sheet = added.data.replies?.[0]?.addSheet?.properties;
      if (sheet) created.push({ properties: sheet });
      existing.set('Settings', { properties: sheet ?? { title: 'Settings', gridProperties: { rowCount: 1000 } } });
    }
    await this.writeHeaders(sheets, spreadsheetId, 'Settings', SETTINGS_COLUMNS, lastCol);
    this.gridRows.set('Settings', 1000);

    // Bold + shade the header row of every tab so the sheet stays readable.
    const requests: sheets_v4.Schema$Request[] = created.map((sheet) => ({
      repeatCell: {
        range: { sheetId: sheet.properties?.sheetId ?? 0, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.878, green: 0.914, blue: 1 },
          },
        },
        fields: 'userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor',
      },
    }));
    if (requests.length > 0) {
      await withRetry('format headers', () =>
        sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } }),
      ).catch(() => undefined);
    }

    await this.load();
  }

  private async writeHeaders(
    sheets: sheets_v4.Sheets,
    spreadsheetId: string,
    sheet: string,
    headers: string[],
    lastCol: string,
  ): Promise<void> {
    await withRetry(`write headers ${sheet}`, () =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${quote(sheet)}!A1:${lastCol}1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      }),
    );
  }

  private async readRows(sheet: string): Promise<unknown[][]> {
    const { sheets, spreadsheetId } = await getClients(this.spreadsheetId);
    const response = await withRetry(`read ${sheet}`, () =>
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${quote(sheet)}!A1:Z` }),
    );
    return (response.data.values ?? []) as unknown[][];
  }

  private async load(): Promise<void> {
    const db = emptyDatabase();

    for (const table of ALL_TABLES) {
      const rows = await this.readRows(table.sheet);
      const index = new Map<string, number>();
      const records: Row[] = [];
      rows.forEach((row, i) => {
        if (i === 0) return;
        const record = rowToRecord<Row>(table, row);
        if (!record) return;
        records.push(this.normaliseRecord(table, record));
        index.set(String(record[table.key]), i + 1);
      });
      this.rowIndex.set(table.sheet, index);
      this.assign(db, table.sheet, records);
    }

    this.settingsRow = this.readSettings(await this.readRows('Settings'));
    db.settings = this.settingsFromRow(this.settingsRow);
    this.db = db;
  }

  private normaliseRecord(table: TableDef, record: Row): Row {
    if (table.sheet === 'Orders') {
      record['status'] = record['status'] || 'Received';
      record['paymentStatus'] = record['paymentStatus'] || 'Unpaid';
      record['paymentMode'] = asPaymentMode(String(record['paymentMode'] ?? 'Cash'));
      if (!Array.isArray(record['photos'])) record['photos'] = [];
      record['pendingSync'] = false;
    }
    if (table.sheet === 'Payments') {
      record['mode'] = asPaymentMode(String(record['mode'] ?? 'Cash'));
    }
    if (table.sheet === 'Parts') {
      record['consumeMode'] = asConsumeMode(String(record['consumeMode'] ?? 'PART_USED'));
      if (typeof record['active'] !== 'boolean') record['active'] = true;
    }
    if (table.sheet === 'Order Parts') {
      record['consumeMode'] = asConsumeMode(String(record['consumeMode'] ?? 'PART_USED'));
      if (typeof record['consumed'] !== 'boolean') record['consumed'] = false;
    }
    return record;
  }

  private assign(db: Database, sheet: string, records: Row[]): void {
    switch (sheet) {
      case 'Customers':
        db.customers = records as unknown as Database["customers"];
        break;
      case 'Orders':
        db.orders = records as unknown as Database["orders"];
        break;
      case 'Payments':
        db.payments = records as unknown as Database["payments"];
        break;
      case 'Parts':
        db.parts = records as unknown as Database["parts"];
        break;
      case 'Stock Movements':
        db.stockMovements = records as unknown as Database["stockMovements"];
        break;
      case 'Suppliers':
        db.suppliers = records as unknown as Database["suppliers"];
        break;
      case 'Order Parts':
        db.orderParts = records as unknown as Database["orderParts"];
        break;
      case 'Status History':
        db.statusHistory = records as unknown as Database["statusHistory"];
        break;
      default:
        break;
    }
  }

  private tableFor(sheet: string): TableDef | undefined {
    return ALL_TABLES.find((table) => table.sheet === sheet);
  }

  /* ------------------------------ settings ----------------------------- */

  private readSettings(rows: unknown[][]): Row {
    const row = { ...this.settingsRow };
    const header = rows[0] ?? [];
    const values = rows[1] ?? [];
    header.forEach((name, i) => {
      const field = SETTINGS_FIELD_BY_HEADER[String(name).trim()];
      if (field) row[field] = values[i] ?? '';
    });
    return row;
  }

  private settingsFromRow(row: Row): Database['settings'] {
    const base = emptyDatabase().settings;
    const bool = (value: unknown, fallback: boolean): boolean => {
      if (value === undefined || value === null || value === '') return fallback;
      const text = String(value).trim().toLowerCase();
      return text === 'true' || text === 'yes' || text === '1';
    };
    const text = (value: unknown): string => (value === undefined || value === null ? '' : String(value));
    return {
      ...base,
      shopName: text(row['shopName']) || base.shopName,
      contact1Name: text(row['contact1Name']),
      contact1Number: text(row['contact1Number']),
      contact2Name: text(row['contact2Name']),
      contact2Number: text(row['contact2Number']),
      address: text(row['address']),
      serviceDescription: text(row['serviceDescription']),
      upiId: text(row['upiId']),
      receiptInformation: text(row['receiptInformation']),
      billFooter: text(row['billFooter']),
      allowNegativeStock: bool(row['allowNegativeStock'], base.allowNegativeStock),
      sheetName: base.sheetName,
      updatedAt: isoOrEmpty(row['updatedAt']) || base.updatedAt,
    };
  }

  private settingsRowFrom(settings: Database['settings']): Row {
    const row: Row = { ...this.settingsRow };
    for (const [field, header] of Object.entries(SETTINGS_FIELD_BY_HEADER)) {
      if (field === 'updatedAt') continue;
      const value = (settings as unknown as Row)[field];
      row[field] = typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : (value ?? '');
    }
    row['updatedAt'] = settings.updatedAt;
    return row;
  }

  private async pushSettings(settings: Database['settings']): Promise<void> {
    this.settingsRow = this.settingsRowFrom(settings);
    const { sheets, spreadsheetId } = await getClients(this.spreadsheetId);
    await withRetry('write settings', () =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${quote('Settings')}!A2:${colLetter(SETTINGS_COLUMNS.length - 1)}2`,
        valueInputOption: 'RAW',
        requestBody: { values: [SETTINGS_COLUMNS.map((header) => String(this.settingsRow[SETTINGS_FIELD_BY_HEADER[header] as string] ?? ''))] },
      }),
    );
  }

  /** Mirror seam for the single settings row, which has its own layout. */
  async pushSettingsRow(settings: Database['settings']): Promise<void> {
    await this.pushSettings(settings);
  }

  /* ------------------------------ writing ------------------------------ */

  snapshot(): Database {
    return this.db;
  }

  async commit<T>(mutate: (draft: Database) => T, options?: StoreOptions): Promise<T> {
    const result = await this.commitChecked(mutate, options);
    return result.value;
  }

  async commitChecked<T>(mutate: (draft: Database) => T, _options?: StoreOptions): Promise<CommitResult<T>> {
    const run = async (): Promise<CommitResult<T>> => {
      const before = this.db;
      const draft: Database = structuredClone(before);
      const value = mutate(draft);

      const changed = this.diff(before, draft);
      for (const key of changed) this.dirty.add(key);
      if (JSON.stringify(before.settings) !== JSON.stringify(draft.settings)) {
        this.settingsDirty = true;
      }

      this.db = draft;

      try {
        await this.flushPending();
        return { value, synced: true };
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        await this.writeBackup().catch(() => undefined);
        return {
          value,
          synced: false,
          warning: {
            code: 'SYNC_PENDING',
            message: 'Saved on this computer. Unable to sync right now - it will retry automatically.',
          },
        };
      }
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Returns the list of table keys whose rows differ. */
  private diff(before: Database, after: Database): TableKey[] {
    const changed: TableKey[] = [];
    for (const table of ALL_TABLES) {
      const a = this.rowsOf(before, table.sheet);
      const b = this.rowsOf(after, table.sheet);
      if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(table.sheet);
    }
    return changed;
  }

  private rowsOf(db: Database, sheet: string): Row[] {
    switch (sheet) {
      case 'Customers':
        return db.customers as unknown as Row[];
      case 'Orders':
        return db.orders as unknown as Row[];
      case 'Payments':
        return db.payments as unknown as Row[];
      case 'Parts':
        return db.parts as unknown as Row[];
      case 'Stock Movements':
        return db.stockMovements as unknown as Row[];
      case 'Suppliers':
        return db.suppliers as unknown as Row[];
      case 'Order Parts':
        return db.orderParts as unknown as Row[];
      case 'Status History':
        return db.statusHistory as unknown as Row[];
      default:
        return [];
    }
  }

  private setRows(db: Database, sheet: string, rows: Row[]): void {
    this.assign(db, sheet, rows);
  }

  async flushPending(): Promise<{ pushed: number; failed: number }> {
    const { sheets, spreadsheetId } = await getClients(this.spreadsheetId);
    let pushed = 0;
    const failures: string[] = [];

    for (const sheet of Array.from(this.dirty)) {
      const table = this.tableFor(sheet);
      if (!table) {
        this.dirty.delete(sheet);
        continue;
      }
      const rows = this.rowsOf(this.db, sheet);
      try {
        await this.writeTable(sheets, spreadsheetId, table, rows);
        this.dirty.delete(sheet);
        pushed += rows.length;
      } catch (error) {
        failures.push(`${sheet}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (this.settingsDirty) {
      try {
        await this.pushSettings(this.db.settings);
        this.settingsDirty = false;
        pushed += 1;
      } catch (error) {
        failures.push(`Settings: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (failures.length > 0) {
      this.lastError = failures.join(' | ');
      await this.writeBackup().catch(() => undefined);
      throw new Error(this.lastError);
    }

    this.db.meta.lastPushAt = new Date().toISOString();
    return { pushed, failed: 0 };
  }

  /**
   * Writes one whole tab straight from the given rows, leaving this store's own
   * database alone.
   *
   * This is the seam a mirror uses: it hands over the authoritative rows and
   * gets the existing stable-id upsert for free - a row whose id is already in
   * the tab is updated where it stands, a new id is appended, and a row that is
   * no longer in the set is trimmed off. Because rows are addressed by id, the
   * same bill can be pushed any number of times and can never appear twice.
   *
   * `derived` supplies the calculated cells (see derivedCellsFor).
   */
  async pushRows(
    sheet: string,
    rows: Row[],
    derived?: Map<string, Record<string, unknown>>,
  ): Promise<void> {
    const table = this.tableFor(sheet);
    if (!table) throw new Error(`Unknown tab: ${sheet}`);
    const { sheets, spreadsheetId } = await getClients(this.spreadsheetId);
    await this.writeTable(sheets, spreadsheetId, table, rows, derived);
  }

  /** Writes a full table. Existing rows are reused by id (so a hand edit in the
   * sheet is not shifted around), new rows are appended, removed rows deleted
   * and any leftover empty rows trimmed away.
   */
  private async writeTable(
    sheets: sheets_v4.Sheets,
    spreadsheetId: string,
    table: TableDef,
    rows: Row[],
    derived?: Map<string, Record<string, unknown>>,
  ): Promise<void> {
    const index = this.rowIndex.get(table.sheet) ?? new Map<string, number>();
    const lastCol = colLetter(table.columns.length - 1);
    const grid = this.gridRows.get(table.sheet) ?? 1000;

    // Grow the tab when needed so we never silently drop rows.
    if (DATA_START_ROW + rows.length > grid) {
      const needed = DATA_START_ROW + rows.length + 20;
      const meta = await withRetry('sheet meta', () =>
        sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' }),
      );
      const sheetId = meta.data.sheets?.find((s) => s.properties?.title === table.sheet)?.properties?.sheetId;
      if (sheetId !== undefined) {
        await withRetry('grow sheet', () =>
          sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [
                {
                  updateSheetProperties: {
                    properties: { sheetId, gridProperties: { rowCount: needed } },
                    fields: 'gridProperties.rowCount',
                  },
                },
              ],
            },
          }),
        );
        this.gridRows.set(table.sheet, needed);
      }
    }

    const valueRows = rows.map((record) =>
      recordToRow(table, record, derived?.get(String(record[table.key] ?? ''))),
    );

    // 1. Update existing rows (grouped into contiguous blocks).
    const updates: sheets_v4.Schema$ValueRange[] = [];
    let blockStart: number | null = null;
    let blockRows: (string | number | boolean)[][] = [];

    const flushBlock = (): void => {
      if (blockStart === null) return;
      updates.push({
        range: `${quote(table.sheet)}!A${blockStart}:${lastCol}${blockStart + blockRows.length - 1}`,
        values: blockRows,
      });
      blockStart = null;
      blockRows = [];
    };

    rows.forEach((record, position) => {
      const id = String(record[table.key] ?? '');
      const existingRow = index.get(id);
      const targetRow = existingRow ?? DATA_START_ROW + position;
      if (existingRow !== undefined) index.set(id, existingRow);
      else index.set(id, targetRow);
      if (blockStart !== null && targetRow === blockStart + blockRows.length) {
        blockRows.push(valueRows[position] as (string | number | boolean)[]);
        return;
      }
      flushBlock();
      blockStart = targetRow;
      blockRows = [valueRows[position] as (string | number | boolean)[]];
    });
    flushBlock();

    for (const update of updates) {
      await withRetry(`update ${table.sheet}`, () =>
        sheets.spreadsheets.values.update({
          spreadsheetId,
          range: update.range as string,
          valueInputOption: 'RAW',
          requestBody: { values: update.values },
        }),
      );
    }

    // 2. Trim everything below the data (removes deleted rows + stale blanks).
    const lastUsed = DATA_START_ROW + Math.max(0, rows.length - 1);
    if (rows.length === 0 || lastUsed < grid) {
      await this.trimBelow(sheets, spreadsheetId, table.sheet, lastUsed, grid);
      if (rows.length === 0) index.clear();
    }
  }

  private async trimBelow(
    sheets: sheets_v4.Sheets,
    spreadsheetId: string,
    sheet: string,
    lastUsedRow: number,
    grid: number,
  ): Promise<void> {
    const meta = await withRetry('sheet meta', () =>
      sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' }),
    );
    const props = meta.data.sheets?.find((s) => s.properties?.title === sheet)?.properties;
    const sheetId = props?.sheetId;
    if (sheetId === undefined) return;
    const start = lastUsedRow; // 0-based index of the first row to remove
    const end = Math.max(props?.gridProperties?.rowCount ?? grid, grid);
    if (end <= start) return;
    await withRetry(`trim ${sheet}`, () =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: { sheetId, dimension: 'ROWS', startIndex: start, endIndex: end },
              },
            },
          ],
        },
      }),
    );
  }

  private async writeBackup(): Promise<void> {
    await fsp.writeFile(this.backupFile, JSON.stringify(this.db, null, 2), 'utf8');
  }

  /* -------------------------------- sync ------------------------------- */

  async syncFromSource(tableKey: string): Promise<TableSyncResult> {
    const table = ALL_TABLES.find((t) => t.sheet.toLowerCase() === tableKey.toLowerCase());
    if (!table) return { created: 0, updated: 0, unchanged: 0, conflicts: 0, details: [] };

    const rows = await this.readRows(table.sheet);
    const local = this.rowsOf(this.db, table.sheet);
    const localById = new Map(local.map((row) => [String(row[table.key]), row]));
    const result: TableSyncResult = { created: 0, updated: 0, unchanged: 0, conflicts: 0, details: [] };
    const merged: Row[] = [];

    rows.forEach((row, i) => {
      if (i === 0) return;
      const record = rowToRecord<Row>(table, row);
      if (!record) return;
      const normalised = this.normaliseRecord(table, record);
      const id = String(normalised[table.key]);
      const existing = localById.get(id);
      if (!existing) {
        merged.push(normalised);
        result.created += 1;
        return;
      }
      const sheetUpdated = isoOrEmpty(normalised['updatedAt']);
      const localUpdated = isoOrEmpty(existing['updatedAt']);
      if (isNewer(sheetUpdated, localUpdated)) {
        merged.push({ ...existing, ...normalised });
        result.updated += 1;
        if (isNewer(localUpdated, sheetUpdated)) result.conflicts += 1;
      } else if (isNewer(localUpdated, sheetUpdated)) {
        merged.push(existing);
        result.conflicts += 1;
      } else {
        merged.push(existing);
        result.unchanged += 1;
      }
    });

    // App-only rows are kept and reported so nothing is ever lost.
    const sheetIds = new Set(
      rows.slice(1).map((row) => String(rowToRecord<Row>(table, row)?.[table.key] ?? '')),
    );
    for (const record of local) {
      const id = String(record[table.key]);
      if (!sheetIds.has(id)) {
        merged.push(record);
        result.unchanged += 1;
        result.details.push(`Only in app: ${id}`);
      }
    }

    await this.commitChecked((draft) => {
      this.setRows(draft, table.sheet, merged);
      return null;
    });

    result.details.push(`${table.sheet}: ${result.created} new, ${result.updated} updated from sheet`);
    return result;
  }

  async syncToSource(tableKey: string): Promise<{ pushed: number; details: string[] }> {
    const table = ALL_TABLES.find((t) => t.sheet.toLowerCase() === tableKey.toLowerCase());
    if (!table) return { pushed: 0, details: [] };
    const local = this.rowsOf(this.db, table.sheet);
    const rows = await this.readRows(table.sheet);
    const sheetById = new Map<string, Row>();
    rows.forEach((row, i) => {
      if (i === 0) return;
      const record = rowToRecord<Row>(table, row);
      if (record) sheetById.set(String(record[table.key]), record);
    });

    const details: string[] = [];
    let pushed = 0;
    for (const record of local) {
      const id = String(record[table.key]);
      const sheetRecord = sheetById.get(id);
      if (!sheetRecord) {
        pushed += 1;
        continue;
      }
      if (isNewer(isoOrEmpty(record['updatedAt']), isoOrEmpty(sheetRecord['updatedAt']))) pushed += 1;
    }
    details.push(`${table.sheet}: ${pushed} of ${local.length} rows are newer in the app`);
    await this.flushPending();
    return { pushed, details };
  }

  async bootstrap(): Promise<{ created: string[]; spreadsheetId: string }> {
    const { sheets } = await getClients(this.spreadsheetId);
    const meta = await withRetry('read spreadsheet', () =>
      sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId }),
    );
    const existing = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title ?? ''));
    const created = [...ALL_TABLES.map((t) => t.sheet), 'Settings'].filter(
      (name) => !existing.has(name),
    );
    await this.init();
    return { created, spreadsheetId: this.spreadsheetId };
  }

  pendingSyncCount(): number {
    return this.dirty.size + (this.settingsDirty ? 1 : 0);
  }

  async health(): Promise<StoreHealth> {
    if (!isGoogleReady()) {
      return { ok: false, mode: this.mode, message: 'Google Sheets is not connected' };
    }
    const pending = this.pendingSyncCount();
    if (pending > 0) {
      return {
        ok: false,
        mode: this.mode,
        message: `Saved on this computer. ${pending} change${pending === 1 ? '' : 's'} waiting to sync.`,
        detail: this.lastError,
      };
    }
    return { ok: true, mode: this.mode, message: 'Connected to Google Sheets' };
  }

  location(): string {
    return spreadsheetUrl(this.spreadsheetId);
  }
}
