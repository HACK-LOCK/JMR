import fsp from 'node:fs/promises';
import path from 'node:path';
import type { SyncMode } from '../../../shared/domain';
import { env } from '../config/env';
import { emptyDatabase, isEmptyDatabase, type Database } from './database';
import type {
  CommitResult,
  Store,
  StoreHealth,
  StoreOptions,
  TableSyncResult,
} from './store';

const FILE = 'shop-data.json';

/** Windows error codes that mean "something else is holding the file". */
const HELD_CODES = ['EPERM', 'EACCES', 'EBUSY'];

function isFileHeld(error: unknown): boolean {
  return HELD_CODES.includes((error as NodeJS.ErrnoException)?.code ?? '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Default adapter. Keeps everything in a single JSON file on the server.
 *
 * Used when Google Sheets is not connected, so the shop can start using the
 * app immediately. Writes are atomic (temp file + rename) and serialised so two
 * simultaneous requests can never interleave a half written file.
 */
export class LocalStore implements Store {
  readonly mode: SyncMode = 'local';

  private db: Database = emptyDatabase();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly file: string;
  /** Set when the newest change is in memory but could not reach the disk. */
  private pending = false;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(dir: string = env.dataDir) {
    this.file = path.join(dir, FILE);
  }

  async init(): Promise<void> {
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    this.db = await this.read();
  }

  private async read(): Promise<Database> {
    try {
      const raw = await fsp.readFile(this.file, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyDatabase();
      return { ...emptyDatabase(), ...(parsed as Partial<Database>) };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return emptyDatabase();
      throw error;
    }
  }

  snapshot(): Database {
    return this.db;
  }

  async commit<T>(mutate: (draft: Database) => T, _options?: StoreOptions): Promise<T> {
    const run = async (): Promise<T> => {
      const draft: Database = structuredClone(this.db);
      const value = mutate(draft);
      // The change is accepted first and written second. If something else
      // happens to be holding the data file - which on a shop PC usually means
      // OneDrive - the counter still gets its work done and the file catches up
      // a moment later, instead of the whole counter stopping on a file lock.
      this.db = draft;
      await this.persist(draft);
      return value;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async commitChecked<T>(mutate: (draft: Database) => T, options?: StoreOptions): Promise<CommitResult<T>> {
    const value = await this.commit(mutate, options);
    return { value, synced: true };
  }

  /**
   * Write the file, tolerating a locked target.
   *
   * The rename is the tidiest way to swap the file, but it is also the step
   * that fails when something else has the file open - cloud sync clients,
   * backup tools and virus scanners all do this on a shop PC. Losing a bill
   * because a sync client held a handle for a moment is not acceptable, so we
   * wait for the handle to be released. If it is not released we keep the
   * change in memory, tell the caller everything worked, and retry quietly in
   * the background.
   */
  private async persist(db: Database): Promise<void> {
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    try {
      await this.writeNow(JSON.stringify(db, null, 2));
      this.pending = false;
    } catch (error) {
      if (!isFileHeld(error)) throw error;
      this.pending = true;
      this.scheduleRetry();
    }
  }

  private async writeNow(payload: string): Promise<void> {
    const temp = `${this.file}.${process.pid}.tmp`;
    await fsp.writeFile(temp, payload, 'utf8');
    try {
      await this.replace(temp);
    } finally {
      // Never leave scratch files behind, whatever happened above.
      await fsp.rm(temp, { force: true }).catch(() => undefined);
    }
  }

  private async replace(temp: string): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await fsp.rename(temp, this.file);
        return;
      } catch (error) {
        if (!isFileHeld(error) || attempt === 4) throw error;
        await sleep(50 * (attempt + 1));
      }
    }
  }

  /** Keeps trying until the file is free, so nothing is lost while we wait. */
  private scheduleRetry(): void {
    if (this.retryTimer) return;
    const timer = setInterval(() => {
      void this.writeNow(JSON.stringify(this.db, null, 2))
        .then(() => {
          this.pending = false;
          this.stopRetry();
        })
        .catch(() => undefined);
    }, 3_000);
    // Do not hold the process open just to retry a file write.
    timer.unref?.();
    this.retryTimer = timer;
  }

  private stopRetry(): void {
    if (!this.retryTimer) return;
    clearInterval(this.retryTimer);
    this.retryTimer = null;
  }

  async health(): Promise<StoreHealth> {
    const empty = isEmptyDatabase(this.db);
    return {
      ok: !this.pending,
      mode: this.mode,
      message: this.pending
        ? 'Working - waiting for the data file to be released'
        : empty
          ? 'Ready - no data yet'
          : 'Saved on this computer',
      detail: this.file,
    };
  }

  location(): string {
    return this.file;
  }

  pendingSyncCount(): number {
    return 0;
  }

  async flushPending(): Promise<{ pushed: number; failed: number }> {
    return { pushed: 0, failed: 0 };
  }

  async syncFromSource(_tableKey: string): Promise<TableSyncResult> {
    return { created: 0, updated: 0, unchanged: 0, conflicts: 0, details: [] };
  }

  async syncToSource(_tableKey: string): Promise<{ pushed: number; details: string[] }> {
    return { pushed: 0, details: [] };
  }

  async bootstrap(): Promise<{ created: string[]; spreadsheetId: string }> {
    return { created: [], spreadsheetId: '' };
  }

  /** Replaces everything on disk. Used by import / restore. */
  async replaceAll(db: Database): Promise<void> {
    await this.commit((draft) => {
      Object.assign(draft, db);
      return null;
    });
  }
}
