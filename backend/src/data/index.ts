import type { Store } from './store';
import { LocalStore } from './localStore';
import { GoogleSheetsStore } from './sheets/sheetsStore';
import { SheetsMirror } from './sheets/mirror';
import { PostgresStore } from './postgres/postgresStore';
import { closePool, describeDatabase, isDatabaseConfigured } from './postgres/pool';
import { env } from '../config/env';
import { isGoogleReady } from '../google/client';
import { readConnection, writeConnection } from './connection';

export { readConnection, writeConnection, readDriveFolderId } from './connection';
export type { ConnectionConfig } from './connection';
export { closePool, isDatabaseConfigured, describeDatabase };

let store: Store | null = null;
let mirror: SheetsMirror | null = null;
let connection: ReturnType<typeof readConnection> = readConnection();

export function isGoogleAvailable(): boolean {
  return isGoogleReady();
}

/** The Google Sheets copy, when one is attached. Null when running without it. */
export function getMirror(): SheetsMirror | null {
  return mirror;
}

/**
 * Opens the one way copy into Google Sheets, if one is wanted and possible.
 *
 * A copy is an extra, never a requirement, so every failure here is logged and
 * then forgotten: the shop carries on with the database alone rather than
 * refusing to start over a spreadsheet.
 */
async function attachMirror(postgres: PostgresStore, spreadsheetId: string): Promise<void> {
  if (!env.sheetsMirror || !isGoogleReady()) {
    console.log('[store] Sheets copy not enabled - the database is on its own');
    return;
  }
  try {
    const opened = await SheetsMirror.attach(spreadsheetId);
    if (!opened) return;
    mirror = opened;
    postgres.attachMirror(opened);
    // Push everything once at boot. This is what makes a row that a failed
    // write, or a restart, left behind reappear: the copy is rebuilt from
    // whatever the database says right now rather than from memory of what
    // might have been sent.
    await opened.reconcile(postgres.snapshot());
    console.log(`[store] Sheets copy on -> ${spreadsheetId}`);
  } catch (error) {
    mirror = null;
    console.warn(
      '[store] Google Sheets copy unavailable, continuing without it:',
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Chooses the persistence adapter once at boot.
 *
 * Three stores, in order of authority:
 *
 *   1. Postgres, when DATABASE_URL is set. This is the real store and it works
 *      with no Google setup at all - a spreadsheet, a service account and Drive
 *      are for bill PDFs and photos, not for business records. A spreadsheet can
 *      still be attached on top as a read-only copy, but it never becomes the
 *      store and is never read back.
 *   2. Google Sheets, when credentials AND a spreadsheet are both present.
 *   3. The local file, so the app always starts.
 *
 * Unlike the Google branch, a database that cannot be reached stops the server
 * instead of falling through. Quietly carrying on would mean the counter takes
 * bills all day into a file on one PC while the rest of the shop is looking at
 * the online database, and nobody finds out until the two are reconciled.
 */
export async function initStore(): Promise<Store> {
  connection = readConnection();

  if (isDatabaseConfigured()) {
    const postgres = new PostgresStore();
    await postgres.init();
    store = postgres;
    console.log(`[store] Postgres mode -> ${describeDatabase()}`);

    // A spreadsheet only becomes a copy while it is actually in use.
    // connection.useGoogle is what the owner set by connecting, and what "stop
    // copying" clears - so honouring it here is what stops a copy that was
    // switched off on purpose from quietly coming back on the next restart.
    // readConnection already falls back to GOOGLE_SHEETS_ID from .env, so setting
    // the spreadsheet in .env still connects it with nothing saved by hand.
    if (connection.useGoogle && connection.spreadsheetId !== '') {
      await attachMirror(postgres, connection.spreadsheetId);
    } else if (connection.spreadsheetId !== '') {
      console.log('[store] Sheets copy off - bills are only in the online database');
    }
    return postgres;
  }

  const canUseGoogle = isGoogleReady() && connection.spreadsheetId !== '' && connection.useGoogle;

  if (canUseGoogle) {
    try {
      const sheetsStore = new GoogleSheetsStore(connection.spreadsheetId);
      await sheetsStore.init();
      await sheetsStore.flushPending().catch(() => undefined);
      store = sheetsStore;
      console.log(`[store] Google Sheets mode -> ${connection.spreadsheetId}`);
      return store;
    } catch (error) {
      console.error(
        '[store] Google Sheets unavailable, falling back to local file:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  const local = new LocalStore();
  await local.init();
  store = local;
  console.log(`[store] Local file mode -> ${local.location()}`);
  return local;
}

/**
 * Swaps the active adapter at runtime (used by the Sheet Sync screen).
 *
 * Refused when Postgres is the configured store. The Sheet Sync screen is about
 * bill PDFs and photos, and letting it repoint where the bills themselves live
 * would move the shop's records on a tap that was meant to disconnect a drive.
 *
 * With the database configured this attaches the Google Sheets copy instead,
 * which is what the screen is actually for in that mode: the bills stay in
 * Postgres and the spreadsheet becomes a copy of them.
 */
export async function useGoogleSheets(spreadsheetId: string): Promise<Store> {
  if (isDatabaseConfigured()) {
    if (!isGoogleReady()) throw new Error('Google service account credentials are missing');
    const postgres = store?.mode === 'postgres' ? (store as PostgresStore) : new PostgresStore();
    await writeConnection({ spreadsheetId, useGoogle: true });
    await attachMirror(postgres, spreadsheetId);
    if (store?.mode === 'postgres') return store;
    store = postgres;
    return postgres;
  }
  if (!isGoogleReady()) throw new Error('Google service account credentials are missing');
  const next = new GoogleSheetsStore(spreadsheetId);
  await next.init();
  await writeConnection({ spreadsheetId, useGoogle: true });
  store = next;
  return next;
}

/**
 * Same reasoning as useGoogleSheets: disconnecting Drive must not move the
 * bills. In database mode this detaches the Google Sheets copy and stops there.
 */
export async function useLocalFile(): Promise<Store> {
  if (isDatabaseConfigured() && store?.mode === 'postgres') {
    const postgres = store as PostgresStore;
    await flushMirror().catch(() => undefined);
    postgres.attachMirror(null);
    mirror = null;
    await writeConnection({ useGoogle: false });
    console.log('[store] Postgres is the configured store - only the Sheets copy was disconnected.');
    return store;
  }
  const local = new LocalStore();
  await local.init();
  await writeConnection({ useGoogle: false });
  store = local;
  return local;
}

/**
 * Pushes anything the copy is still missing before it is let go, so
 * disconnecting it cannot throw away a row the owner can see on screen.
 */
async function flushMirror(): Promise<void> {
  if (!mirror) return;
  const pending = mirror.pendingCount();
  if (pending === 0) return;
  const ok = await mirror.flush();
  if (!ok) {
    console.warn(
      `[mirror] ${pending} tab(s) could not be copied to Google Sheets before disconnecting:`,
      mirror.lastError(),
    );
  }
}

export function getStore(): Store {
  if (!store) throw new Error('Data store is not ready');
  return store;
}

export function db() {
  return getStore().snapshot();
}
