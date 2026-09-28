import type { Store } from './store';
import { LocalStore } from './localStore';
import { GoogleSheetsStore } from './sheets/sheetsStore';
import { env } from '../config/env';
import { isGoogleReady } from '../google/client';
import { readConnection, writeConnection } from './connection';

export { readConnection, writeConnection, readDriveFolderId } from './connection';
export type { ConnectionConfig } from './connection';

let store: Store | null = null;
let connection: ReturnType<typeof readConnection> = readConnection();

export function isGoogleAvailable(): boolean {
  return isGoogleReady();
}

/**
 * Chooses the persistence adapter once at boot.
 * Google Sheets is used only when credentials AND a spreadsheet are present,
 * so the app always starts even before Google is set up.
 */
export async function initStore(): Promise<Store> {
  connection = readConnection();
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

/** Swaps the active adapter at runtime (used by the Sheet Sync screen). */
export async function useGoogleSheets(spreadsheetId: string): Promise<Store> {
  if (!isGoogleReady()) throw new Error('Google service account credentials are missing');
  const next = new GoogleSheetsStore(spreadsheetId);
  await next.init();
  await writeConnection({ spreadsheetId, useGoogle: true });
  store = next;
  return next;
}

export async function useLocalFile(): Promise<Store> {
  const local = new LocalStore();
  await local.init();
  await writeConnection({ useGoogle: false });
  store = local;
  return local;
}

export function getStore(): Store {
  if (!store) throw new Error('Data store is not ready');
  return store;
}

export function db() {
  return getStore().snapshot();
}
