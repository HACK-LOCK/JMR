import {
  DATASETS,
  type DatasetKey,
  type GoogleConnectResult,
  type SyncResult,
  type SyncStatus,
} from '../../../shared/domain';
import { toIso } from '../core/datetime';
import { ValidationError } from '../core/errors';
import { nowIso } from '../core/id';
import { getMirror, getStore, isGoogleAvailable, useGoogleSheets, useLocalFile } from '../data/index';
import { mutate, read } from '../data/mutate';
import type { Database } from '../data/database';
import { TABLES, recordToRow, rowToRecord } from '../data/sheets/sheetSchema';
import { driveAccessCached, forgetDriveAccess, shareWithEmails } from '../google/drive';
import { extractGoogleId } from '../google/client';
import { googleConnectionReport } from '../google/connect';
import { readConnection, writeConnection } from '../data';
import { createDriveFolderTree, forgetDriveFolders } from './googleSetup';

const SHEET_BY_DATASET: Record<DatasetKey, string> = {
  customers: 'Customers',
  orders: 'Orders',
  payments: 'Payments',
  parts: 'Parts',
  stockMovements: 'Stock Movements',
  suppliers: 'Suppliers',
  settings: 'Settings',
};

const DATASET_LABEL: Record<DatasetKey, string> = {
  customers: 'Customers',
  orders: 'Orders',
  payments: 'Payments',
  parts: 'Parts',
  stockMovements: 'Stock Movements',
  suppliers: 'Suppliers',
  settings: 'Settings',
};

export async function syncStatus(): Promise<SyncStatus> {
  const store = getStore();
  const db = read();
  const connection = readConnection();
  const pending = store.pendingSyncCount();
  const access = await driveAccessCached();
  const driveConnected = access.hasFolder;

  if (store.mode === 'local') {
    return {
      mode: 'local',
      connected: false,
      spreadsheetId: connection.spreadsheetId,
      spreadsheetUrl: connection.spreadsheetId
        ? `https://docs.google.com/spreadsheets/d/${connection.spreadsheetId}/edit`
        : '',
      driveConnected,
      lastPushAt: db.meta.lastPushAt,
      lastPullAt: db.meta.lastPullAt,
      pendingCount: 0,
      message: isGoogleAvailable()
        ? 'Using this computer. Connect Google Sheets to also keep a copy online.'
        : 'Using this computer. Add the Google service account key to connect Google Sheets.',
    };
  }

  if (store.mode === 'postgres') {
    const health = await store.health();
    const sheets = getMirror();
    const pending = sheets?.pendingCount() ?? 0;
    const copyFailed = sheets ? sheets.lastError() : '';

    let message: string;
    if (!health.ok) {
      message = `The online database cannot be reached right now: ${health.detail ?? 'please try again'}.`;
    } else if (!sheets) {
      message = 'Bills are saved in the online database. No Google Sheets copy is connected.';
    } else if (pending > 0) {
      message = `Bills are saved in the online database. ${pending} sheet${pending === 1 ? '' : 's'} ${pending === 1 ? 'is' : 'are'} still behind.`;
    } else {
      message = 'Bills are saved in the online database and copied to Google Sheets.';
    }

    return {
      mode: 'postgres',
      connected: health.ok,
      // With a spreadsheet attached this is the copy's own link, so the owner
      // can open and read it. Without one it is the database's address, which
      // carries no password.
      spreadsheetId: sheets?.spreadsheetId() ?? '',
      spreadsheetUrl: sheets ? sheets.location() : store.location(),
      driveConnected,
      lastPushAt: sheets?.lastFlushAt() || db.meta.lastPushAt,
      lastPullAt: db.meta.lastPullAt,
      pendingCount: pending,
      message,
    };
  }

  return {
    mode: 'sheets',
    connected: pending === 0,
    spreadsheetId: connection.spreadsheetId,
    spreadsheetUrl: store.location(),
    driveConnected,
    lastPushAt: db.meta.lastPushAt,
    lastPullAt: db.meta.lastPullAt,
    pendingCount: pending,
    message:
      pending === 0
        ? 'Connected to Google Sheets. Everything is saved online.'
        : `Connected, but ${pending} change${pending === 1 ? '' : 's'} are still waiting to reach Google Sheets.`,
  };
}

export function datasetLabels(): { key: DatasetKey; label: string; sheet: string; rows: number }[] {
  const db = read();
  return DATASETS.map((key) => ({
    key,
    label: DATASET_LABEL[key],
    sheet: SHEET_BY_DATASET[key],
    rows: countRows(key, db),
  }));
}

function countRows(key: DatasetKey, db: ReturnType<typeof read>): number {
  switch (key) {
    case 'customers':
      return db.customers.length;
    case 'orders':
      return db.orders.length;
    case 'payments':
      return db.payments.length;
    case 'parts':
      return db.parts.length;
    case 'stockMovements':
      return db.stockMovements.length;
    case 'suppliers':
      return db.suppliers.length;
    case 'settings':
      return 1;
    default:
      return 0;
  }
}

/** Retries any Google writes that failed earlier. */
export async function retryPending(): Promise<{ ok: boolean; message: string }> {
  const store = getStore();
  const hasSomethingToRetry =
    store.mode === 'sheets' || (store.mode === 'postgres' && getMirror() !== null);
  if (!hasSomethingToRetry) {
    return { ok: true, message: 'Nothing is waiting to sync.' };
  }
  try {
    const result = await store.flushPending();
    if (result.failed > 0) {
      return { ok: false, message: 'Unable to sync right now. Please try again.' };
    }
    return { ok: true, message: `${result.pushed} change${result.pushed === 1 ? '' : 's'} synced.` };
  } catch {
    return { ok: false, message: 'Unable to sync right now. Please try again.' };
  }
}

/**
 * Pulling data in from the spreadsheet.
 *
 * Refused while the database is the store. The spreadsheet is a copy of the
 * shop's records, and a bill's amount, payment or stock figure is not something
 * that should be able to change because a cell in a browser was edited. The
 * bills are changed in the app, where the change is checked and recorded.
 */
export async function syncPull(dataset: DatasetKey): Promise<SyncResult> {
  if (getStore().mode === 'postgres') {
    return {
      created: 0,
      updated: 0,
      unchanged: 0,
      conflicts: 0,
      skipped: 0,
      message: importRefusedMessage(),
      details: [],
    };
  }
  if (dataset === 'settings') {
    return pullSettings();
  }
  const store = getStore();
  const result = await store.syncFromSource(SHEET_BY_DATASET[dataset]);
  await mutate((draft) => {
    draft.meta.lastPullAt = nowIso();
    return null;
  });
  // With Postgres this is a re-read of the database, not a spreadsheet, so the
  // sentence has to name wherever the rows actually came from.
  const source = store.mode === 'postgres' ? 'the online database' : 'the sheet';
  return {
    created: result.created,
    updated: result.updated,
    unchanged: result.unchanged,
    conflicts: result.conflicts,
    skipped: 0,
    message:
      result.created + result.updated === 0
        ? `No new data in ${source}.`
        : `${DATASET_LABEL[dataset]}: ${result.created} added, ${result.updated} updated from ${source}.`,
    details: result.details,
  };
}

function importRefusedMessage(): string {
  return 'The spreadsheet is a copy of the online database. Changes are made in the app, not in Google Sheets.';
}

export async function syncPush(dataset: DatasetKey): Promise<SyncResult> {
  const store = getStore();
  if (store.mode === 'postgres') {
    // The data is already in the database. What "push" means here is re-sending
    // that tab to the spreadsheet copy, so the owner can bring the sheet level
    // up by hand after editing something outside the app.
    if (!getMirror()) {
      return {
        created: 0,
        updated: 0,
        unchanged: 0,
        conflicts: 0,
        skipped: 0,
        message: `${DATASET_LABEL[dataset]} is already saved in the online database. No spreadsheet copy is connected.`,
        details: [],
      };
    }
    const result = await store.syncToSource(SHEET_BY_DATASET[dataset]);
    return {
      created: 0,
      updated: result.pushed,
      unchanged: 0,
      conflicts: 0,
      skipped: 0,
      message: `${DATASET_LABEL[dataset]}: ${result.pushed} row${result.pushed === 1 ? '' : 's'} copied to the spreadsheet.`,
      details: result.details,
    };
  }
  if (store.mode !== 'sheets') {
    return {
      created: 0,
      updated: 0,
      unchanged: 0,
      conflicts: 0,
      skipped: 0,
      message: 'Connect Google Sheets first.',
      details: [],
    };
  }
  if (dataset === 'settings') {
    const db = read();
    await mutate((draft) => {
      draft.settings.updatedAt = nowIso();
      return null;
    });
    void db;
    return {
      created: 0,
      updated: 1,
      unchanged: 0,
      conflicts: 0,
      skipped: 0,
      message: 'Shop details sent to the Settings sheet.',
      details: [],
    };
  }
  const result = await store.syncToSource(SHEET_BY_DATASET[dataset]);
  return {
    created: 0,
    updated: result.pushed,
    unchanged: 0,
    conflicts: 0,
    skipped: 0,
    message: `${DATASET_LABEL[dataset]}: ${result.pushed} row${result.pushed === 1 ? '' : 's'} sent to the sheet.`,
    details: result.details,
  };
}

async function pullSettings(): Promise<SyncResult> {
  const store = getStore();
  if (store.mode === 'postgres') {
    return {
      created: 0, updated: 0, unchanged: 1, conflicts: 0, skipped: 0,
      message: 'Shop details are already stored in the online database.', details: [],
    };
  }
  if (store.mode !== 'sheets') {
    return {
      created: 0, updated: 0, unchanged: 1, conflicts: 0, skipped: 0,
      message: 'Connect Google Sheets first.', details: [],
    };
  }
  // Settings has a single row; re-reading the workbook refreshes the cache.
  await store.bootstrap();
  return {
    created: 0,
    updated: 1,
    unchanged: 0,
    conflicts: 0,
    skipped: 0,
    message: 'Shop details read from the Settings sheet.',
    details: [],
  };
}

/* ------------------------------ export ------------------------------ */

export function exportDataset(dataset: DatasetKey): { filename: string; csv: string } {
  const db = read();
  const stamp = new Date().toISOString().slice(0, 10);

  if (dataset === 'settings') {
    const headers = ['Field', 'Value'];
    const rows = Object.entries(db.settings).map(([key, value]) => [key, String(value)]);
    return { filename: `settings-${stamp}.csv`, csv: toCsvLocal(headers, rows) };
  }

  const table = TABLES[dataset];
  const records = recordsOf(dataset, db);
  const headers = table.columns.map((column) => column.header);
  const rows = records.map((record) => recordToRow(table, record));
  return { filename: `${dataset}-${stamp}.csv`, csv: toCsvLocal(headers, rows) };
}

function recordsOf(dataset: Exclude<DatasetKey, 'settings'>, db: Database): Record<string, unknown>[] {
  switch (dataset) {
    case 'customers':
      return db.customers as unknown as Record<string, unknown>[];
    case 'orders':
      return db.orders as unknown as Record<string, unknown>[];
    case 'payments':
      return db.payments as unknown as Record<string, unknown>[];
    case 'parts':
      return db.parts as unknown as Record<string, unknown>[];
    case 'stockMovements':
      return db.stockMovements as unknown as Record<string, unknown>[];
    case 'suppliers':
      return db.suppliers as unknown as Record<string, unknown>[];
    default:
      return [];
  }
}

function toCsvLocal(headers: string[], rows: unknown[][]): string {
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\r\n');
}

/* ------------------------------ import ------------------------------ */

/**
 * Bulk import from a CSV the owner edited in Excel / Google Sheets.
 * Rows are matched on their stable id, so importing the same file twice is
 * harmless. `updatedAt` decides the winner when both sides changed.
 *
 * Only available while the shop runs on its own files. With the online database
 * as the store this is refused: a bill, a payment or a stock figure that
 * arrived from a spreadsheet is a figure nobody in the shop checked, and it
 * would land in the day's takings. The owner edits the app instead.
 */
export async function importRows(input: {
  dataset: Exclude<DatasetKey, 'settings'>;
  rows: Record<string, unknown>[];
  mode: 'merge' | 'replace';
}): Promise<SyncResult> {
  const dataset = input.dataset;
  const table = TABLES[dataset];
  if (getStore().mode === 'postgres') {
    return {
      created: 0, updated: 0, unchanged: 0, conflicts: 0, skipped: 0,
      message: importRefusedMessage(), details: [],
    };
  }
  if (!table) {
    return {
      created: 0, updated: 0, unchanged: 0, conflicts: 0, skipped: 0,
      message: 'Unknown data set.', details: [],
    };
  }

  const headerToField = new Map(table.columns.map((column) => [column.header.toLowerCase(), column.field]));
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let conflicts = 0;
  let skipped = 0;
  const details: string[] = [];

  const result = await mutate((draft) => {
    const existing = new Map(
      recordsOf(dataset, draft).map((record) => [String(record[table.key]), record]),
    );
    const now = nowIso();

    for (const row of input.rows) {
      const record: Record<string, unknown> = {};
      for (const [header, value] of Object.entries(row)) {
        const field = headerToField.get(header.trim().toLowerCase());
        if (field) record[field] = value;
      }
      const id = String(record[table.key] ?? '').trim();
      if (!id) {
        skipped += 1;
        continue;
      }
      record[table.key] = id;
      if (!record['updatedAt']) record['updatedAt'] = now;

      const current = existing.get(id);
      if (!current) {
        insertRecord(draft, dataset, record);
        existing.set(id, record);
        created += 1;
        continue;
      }
      const incomingTime = Date.parse(toIso(String(record['updatedAt']), new Date(0)));
      const currentTime = Date.parse(toIso(String(current['updatedAt']), new Date(0)));
      if (incomingTime > currentTime) {
        replaceRecord(draft, dataset, id, { ...current, ...record });
        updated += 1;
      } else if (incomingTime < currentTime) {
        conflicts += 1;
        details.push(`${id}: kept the app version (it is newer)`);
      } else {
        unchanged += 1;
      }
    }

    if (input.mode === 'replace') {
      // Rows missing from the file are kept, never deleted - a shop must not
      // lose business records because of a partial file.
      details.push('Replace mode keeps rows that are not in the file.');
    }
    return null;
  });

  void result;
  return {
    created,
    updated,
    unchanged,
    conflicts,
    skipped,
    message: `${DATASET_LABEL[dataset]}: ${created} added, ${updated} updated, ${unchanged} unchanged${
      conflicts ? `, ${conflicts} kept app version` : ''
    }${skipped ? `, ${skipped} skipped` : ''}.`,
    details: details.slice(0, 20),
  };
}

function insertRecord(
  draft: Database,
  dataset: Exclude<DatasetKey, 'settings'>,
  record: Record<string, unknown>,
): void {
  const typed = rowToRecord<Record<string, unknown>>(TABLES[dataset], recordToRow(TABLES[dataset], record));
  if (!typed) return;
  switch (dataset) {
    case 'customers':
      draft.customers.push(typed as unknown as (typeof draft.customers)[number]);
      break;
    case 'orders':
      draft.orders.push(typed as unknown as (typeof draft.orders)[number]);
      break;
    case 'payments':
      draft.payments.push(typed as unknown as (typeof draft.payments)[number]);
      break;
    case 'parts':
      draft.parts.push(typed as unknown as (typeof draft.parts)[number]);
      break;
    case 'stockMovements':
      draft.stockMovements.push(typed as unknown as (typeof draft.stockMovements)[number]);
      break;
    case 'suppliers':
      draft.suppliers.push(typed as unknown as (typeof draft.suppliers)[number]);
      break;
    default:
      break;
  }
}

function replaceRecord(
  draft: Database,
  dataset: Exclude<DatasetKey, 'settings'>,
  id: string,
  record: Record<string, unknown>,
): void {
  const key = TABLES[dataset].key;
  const list = recordsOf(dataset, draft) as Record<string, unknown>[];
  const index = list.findIndex((item) => String(item[key]) === id);
  if (index === -1) return;
  const typed = rowToRecord<Record<string, unknown>>(
    TABLES[dataset],
    recordToRow(TABLES[dataset], record),
  );
  if (typed) list[index] = typed;
}

/* ---------------------------- connect Google --------------------------- */

/** Read-only diagnosis of the Google connection, safe to call at any time. */
export async function googleCheck(input: { spreadsheetId?: string; driveFolderId?: string } = {}) {
  return googleConnectionReport(input);
}

/**
 * Connects Google Sheets.
 *
 * A link or a bare ID is both accepted, because pasting the link is what people
 * actually do. The spreadsheet is opened and written to BEFORE anything is
 * saved as connected, so a wrong link can never leave the app half-connected.
 */
export async function setupGoogle(input: {
  spreadsheetId: string;
  shareWith: string[];
  driveFolderId?: string;
  testOnly?: boolean;
}): Promise<GoogleConnectResult> {
  const spreadsheetId = extractGoogleId(input.spreadsheetId);
  const driveFolderId = extractGoogleId(input.driveFolderId ?? '');
  const report = await googleConnectionReport({ spreadsheetId, driveFolderId });

  if (!report.sheetsReady) {
    // A bill folder can be connected on its own: bills and photos have to keep
    // working on a day when the spreadsheet is not connected yet.
    const folderItem = report.items.find((entry) => entry.id === 'drive');
    if (driveFolderId && folderItem?.state === 'ok' && !input.testOnly) {
      await writeConnection({ driveFolderId });
      forgetDriveAccess();
      forgetDriveFolders();
      const saved = await googleConnectionReport({ spreadsheetId: '', driveFolderId });
      return {
        status: await syncStatus(),
        report: saved,
        shared: 0,
        message: `Bills and photos will now be saved to Google Drive. ${saved.summary}`,
      };
    }
    const problem = report.items.find((entry) => entry.id === 'spreadsheet');
    throw new ValidationError(
      problem?.state === 'problem'
        ? `${problem.detail} ${problem.fix}`.trim()
        : 'Create a Google Sheet, share it with the service account as Editor, then paste its link.',
    );
  }

  if (input.testOnly) {
    return { status: await syncStatus(), report, shared: 0, message: report.summary };
  }

  await writeConnection({ spreadsheetId, useGoogle: true });
  await useGoogleSheets(spreadsheetId);

  // The folder link is remembered, not just checked: bills and photos are
  // written into this folder, so an unchecked one would change nothing.
  if (driveFolderId) {
    await writeConnection({ driveFolderId });
    forgetDriveFolders();
  }

  const emails = input.shareWith.map((email) => email.trim()).filter(Boolean);
  let shared = 0;
  if (emails.length > 0) {
    // The service account can only share what it can write to, so a failure
    // here is never fatal - the sheet is already connected.
    shared += await shareWithEmails(spreadsheetId, emails);
  }

  if (report.driveReady) {
    const folderId = await createDriveFolderTree(emails).catch((error) => {
      console.warn('[sync] drive folder tree not ready:', error instanceof Error ? error.message : error);
      return '';
    });
    if (folderId) shared += emails.length;
  }

  forgetDriveAccess();
  forgetDriveFolders();
  const finalReport = await googleConnectionReport({ spreadsheetId, driveFolderId });
  const asCopy = getStore().mode === 'postgres';
  return {
    status: await syncStatus(),
    report: finalReport,
    shared,
    message: finalReport.sheetsReady
      ? asCopy
        ? `Connected to "${finalReport.spreadsheetTitle || 'your spreadsheet'}". The bills stay in the online database and are copied into this spreadsheet.`
        : `Connected to "${finalReport.spreadsheetTitle || 'your spreadsheet'}". Every repair is now saved online.`
      : finalReport.summary,
  };
}

export async function disconnectGoogle(): Promise<SyncStatus> {
  await useLocalFile();
  return syncStatus();
}
