import type { SyncMode } from '../../../shared/domain';
import type { Database } from './database';

export interface StoreHealth {
  ok: boolean;
  mode: SyncMode;
  message: string;
  detail?: string;
}

export interface StoreOptions {
  /** Identifies the caller for audit columns. */
  user?: string;
}

export interface CommitResult<T> {
  value: T;
  /** False when the change is safe locally but has not reached Google yet. */
  synced: boolean;
  warning?: { code: string; message: string };
}

export interface TableSyncResult {
  created: number;
  updated: number;
  unchanged: number;
  conflicts: number;
  details: string[];
}

/**
 * Persistence port.
 *
 * Two implementations exist: a local JSON file store (default, always works)
 * and a Google Sheets store. Business logic is written against this interface
 * only, so replacing Google Sheets with a real database later is a one-file
 * change and nothing else in the app has to move.
 */
export interface Store {
  readonly mode: SyncMode;
  init(): Promise<void>;
  /** Current in-memory snapshot. Treat as read-only. */
  snapshot(): Database;
  /** Atomically apply a mutation and persist it. */
  commit<T>(mutate: (draft: Database) => T, options?: StoreOptions): Promise<T>;
  /** Same as commit, but also reports whether the write reached Google. */
  commitChecked<T>(mutate: (draft: Database) => T, options?: StoreOptions): Promise<CommitResult<T>>;
  health(): Promise<StoreHealth>;
  /** Human readable location of the data (spreadsheet URL or data folder). */
  location(): string;
  /** How many tables still need to be pushed to Google. */
  pendingSyncCount(): number;
  /** Retry any pending Google writes. */
  flushPending(): Promise<{ pushed: number; failed: number }>;
  /** Pull newer rows from the source into the app (Sheets -> App). */
  syncFromSource(tableKey: string): Promise<TableSyncResult>;
  /** Send app rows that are newer than the source (App -> Sheets). */
  syncToSource(tableKey: string): Promise<{ pushed: number; details: string[] }>;
  /** Create any missing tabs and headers. Safe to run repeatedly. */
  bootstrap(): Promise<{ created: string[]; spreadsheetId: string }>;
}
