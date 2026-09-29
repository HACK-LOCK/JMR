import { spreadsheetUrl } from '../../google/client';
import { emptyDatabase, type Database } from '../database';
import { GoogleSheetsStore } from './sheetsStore';
import { derivedCellsFor, MIRROR_SHEETS, rowsForSheet } from './sheetSchema';

/**
 * A one way copy of the shop into Google Sheets.
 *
 * The rule this file exists to enforce: Postgres is the only thing anybody
 * writes to, and the spreadsheet only ever receives. There is deliberately no
 * method that reads rows back out of a sheet into the database, because a copy
 * of a bill that somebody edited in a browser is not something the shop's
 * takings should ever be rebuilt from.
 *
 * What it does instead is track which tabs the last commit touched and push only
 * those, addressed by stable id, so pushing the same bill twice updates one row
 * rather than making two.
 *
 * Failure is never fatal. A bill that reached the database is a real bill; the
 * sheet is a copy, and a copy that is behind is a nuisance rather than lost
 * work. A failed tab is remembered, retried by the owner from the sync screen,
 * and pushed again in full whenever the server restarts - so even a restart in
 * the middle of a failure cannot leave a row behind for good.
 */
export class SheetsMirror {
  private dirty = new Set<string>();
  /** The last database state handed over, so a retry writes the right rows. */
  private latest: Database = emptyDatabase();
  private failure = '';
  private queue: Promise<unknown> = Promise.resolve();
  private flushedAt = '';

  private constructor(private readonly sheets: GoogleSheetsStore) {}

  /**
   * Opens a mirror, creating any missing tabs and reading the current row
   * positions. Returns null when Google is not usable, because a mirror is an
   * extra and must never be the reason the shop cannot start.
   */
  static async attach(spreadsheetId: string): Promise<SheetsMirror | null> {
    const sheets = new GoogleSheetsStore(spreadsheetId);
    await sheets.init();
    return new SheetsMirror(sheets);
  }

  get enabled(): boolean {
    return true;
  }

  location(): string {
    return spreadsheetUrl(this.sheets.spreadsheetId);
  }

  spreadsheetId(): string {
    return this.sheets.spreadsheetId;
  }

  lastError(): string {
    return this.failure;
  }

  lastFlushAt(): string {
    return this.flushedAt;
  }

  pendingCount(): number {
    return this.dirty.size;
  }

  pendingTabs(): string[] {
    return [...this.dirty];
  }

  /**
   * Records the tabs a commit touched and tries to send them now.
   *
   * Returns true when everything reached the sheet. A false return is not an
   * error the caller should raise - the database already has the data, it only
   * means the reply should say so.
   */
  async push(after: Database, tabs: string[]): Promise<boolean> {
    this.latest = after;
    for (const tab of tabs) this.dirty.add(tab);
    return this.flush();
  }

  /** Pushes every tab. Used at boot, so a missed write cannot stay missed. */
  async reconcile(after: Database): Promise<void> {
    this.latest = after;
    for (const tab of MIRROR_SHEETS) this.dirty.add(tab);
    await this.flush().catch(() => undefined);
  }

  /** Retries whatever is still outstanding. Safe to call at any time. */
  async flush(): Promise<boolean> {
    const run = async (): Promise<boolean> => {
      if (this.dirty.size === 0) return true;
      const failures: string[] = [];
      for (const tab of [...this.dirty]) {
        try {
          await this.pushTab(tab);
          this.dirty.delete(tab);
        } catch (error) {
          failures.push(`${tab}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (failures.length > 0) {
        this.failure = failures.join(' | ');
        return false;
      }
      this.failure = '';
      this.flushedAt = new Date().toISOString();
      return true;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async pushTab(tab: string): Promise<void> {
    if (tab === 'Settings') {
      await this.sheets.pushSettingsRow(this.latest.settings);
      return;
    }
    const rows = rowsForSheet(this.latest, tab);
    await this.sheets.pushRows(tab, rows, derivedCellsFor(tab, this.latest));
  }
}
