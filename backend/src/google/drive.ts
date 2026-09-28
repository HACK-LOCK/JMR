import { readDriveFolderId } from '../data/connection';
import { getDrive, isGoogleReady, withRetry } from './client';

/**
 * Google Drive folder handling for bills.
 *
 *   <root>/Jai Mataji Mobile Repairing/Bills/2026/January/ORD-2026-00482.pdf
 *
 * Folder ids are cached in memory for the life of the process and looked up by
 * name inside the parent, so the tree is created once and then reused. The
 * Order ID is always the file name, which is what makes "update the same PDF"
 * possible instead of creating duplicates.
 */

const folderCache = new Map<string, string>();
let accessCache: { at: number; value: DriveAccess } | null = null;

/**
 * Said instead of a raw Drive error whenever no folder is connected. A service
 * account cannot make one for itself, so this is the only honest answer: until
 * the owner shares a folder, bills stay on this computer.
 */
export const NO_DRIVE_FOLDER_MESSAGE =
  'No Google Drive folder is connected yet. Open Sheet Sync, make a folder in your own Google Drive, share it with the service account as Editor, then paste the folder link there.';

function cacheKey(parentId: string, name: string): string {
  return `${parentId}::${name.toLowerCase()}`;
}

/**
 * The folder everything is written into: what the owner connected, or the one
 * in the .env file. A blank argument means "use the connected one", which keeps
 * the on-screen check and the bill flow looking at the same folder.
 */
function rootFolder(override?: string): string {
  return (override ?? '').trim() || readDriveFolderId();
}

export function driveReady(override?: string): boolean {
  if (!isGoogleReady()) return false;
  if (!rootFolder(override)) return false;
  // Optimistic until the first real check has run: the bill flow still saves
  // locally if Drive then turns out to be unusable, so nothing is lost.
  return accessCache?.value.hasFolder !== false;
}

export function resetDriveCache(): void {
  folderCache.clear();
  accessCache = null;
}

/* ---------------------------- diagnostics ----------------------------- */

export interface DriveAccess {
  /** The service account answered. */
  reachable: boolean;
  /** A folder shared with the service account was found. */
  hasFolder: boolean;
  folderId: string;
  folderName: string;
  detail: string;
  fix: string;
}

/**
 * Reports what Drive can actually do for us.
 *
 * A service account has no Drive storage of its own, so it can only write into
 * a folder the owner created and shared. This check says plainly whether that
 * has happened yet, instead of failing later on the first bill.
 */
export async function checkDriveAccess(rootFolderId?: string): Promise<DriveAccess> {
  const folderId = rootFolder(rootFolderId);
  const base: DriveAccess = {
    reachable: false,
    hasFolder: false,
    folderId,
    folderName: '',
    detail: '',
    fix: '',
  };

  if (!isGoogleReady()) {
    return { ...base, detail: 'Google service account key is not loaded yet.' };
  }

  try {
    const drive = await getDrive();
    const about = await withRetry('drive quota', () => drive.about.get({ fields: 'storageQuota' }));
    const limit = Number(about.data.storageQuota?.limit ?? '0');
    const hasOwnStorage = Number.isFinite(limit) ? limit > 0 : false;
    if (!hasOwnStorage && !folderId) {
      // Not fatal, just the normal starting point: a folder shared by the owner
      // has the owner's storage, and nothing works until that folder exists.
      return {
        ...base,
        reachable: true,
        detail:
          'No Drive folder is connected, so bills and photos are only kept on this computer. The service account has no Drive storage of its own and can only save inside a folder you share with it.',
      };
    }
    if (!folderId) {
      return { ...base, reachable: true, detail: 'Drive is ready, but no folder has been chosen yet.' };
    }
  } catch (error) {
    return {
      ...base,
      detail: `Drive could not be reached: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  try {
    const drive = await getDrive();
    const meta = await withRetry('read folder', () =>
      drive.files.get({ fileId: folderId, fields: 'id,name', supportsAllDrives: true }),
    );
    return {
      reachable: true,
      hasFolder: true,
      folderId,
      folderName: meta.data.name ?? '',
      detail: `Bills and photos will be saved inside "${meta.data.name ?? folderId}".`,
      fix: '',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      reachable: true,
      hasFolder: false,
      folderId,
      folderName: '',
      detail: `The bill folder cannot be opened: ${message}`,
      fix: 'Create a folder in your own Google Drive, share it with the service account as Editor, then paste the folder link.',
    };
  }
}

/**
 * The same check, but remembered for two minutes. The app polls its status
 * screen often, and Drive answers should not be paid for on every poll.
 */
export async function driveAccessCached(
  rootFolderId?: string,
  maxAgeMs = 120_000,
): Promise<DriveAccess> {
  const key = rootFolder(rootFolderId);
  if (accessCache && accessCache.value.folderId === key && Date.now() - accessCache.at < maxAgeMs) {
    return accessCache.value;
  }
  const value = await checkDriveAccess(rootFolderId);
  accessCache = { at: Date.now(), value };
  return value;
}

export function forgetDriveAccess(): void {
  accessCache = null;
}

/** Turns the raw Drive/Sheets API text into one short sentence. */
export function explainGoogleError(error: unknown): string {
  const code = (error as { code?: number }).code;
  const message = error instanceof Error ? error.message : String(error);
  if (/quota|storage/i.test(message)) {
    return 'This Google account has no Drive storage for the service account. Share a folder from your own Drive instead.';
  }
  if (code === 404) return 'That file was not found, or it is not shared with the service account yet.';
  if (code === 403) return 'The service account does not have permission for that file yet. Share it as Editor.';
  return message;
}

async function findFolder(parentId: string, name: string): Promise<string | null> {
  // An empty id here would ask Drive for "files in no folder at all", which it
  // answers with a bare "File not found". Refuse it before that happens.
  if (!parentId) throw new Error(NO_DRIVE_FOLDER_MESSAGE);
  const drive = await getDrive();
  const escaped = name.replace(/'/g, "\\'");
  const query = [
    `name = '${escaped}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `'${parentId}' in parents`,
    'trashed = false',
  ].join(' and ');
  const response = await withRetry('find folder', () =>
    drive.files.list({ q: query, fields: 'files(id,name)', pageSize: 5 }),
  );
  return response.data.files?.[0]?.id ?? null;
}

async function createFolder(parentId: string, name: string): Promise<string> {
  const drive = await getDrive();
  const response = await withRetry('create folder', () =>
    drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentId ? { parents: [parentId] } : {}),
      },
      fields: 'id',
    }),
  );
  const id = response.data.id;
  if (!id) throw new Error(`Could not create folder "${name}"`);
  return id;
}

/** Returns the folder id, creating it (and any missing parent) if needed. */
export async function ensureFolder(parentId: string, name: string): Promise<string> {
  const key = cacheKey(parentId, name);
  const cached = folderCache.get(key);
  if (cached) return cached;

  const existing = await findFolder(parentId, name);
  const id = existing ?? (await createFolder(parentId, name));
  folderCache.set(key, id);
  return id;
}

export interface BillLocation {
  fileId: string;
  link: string;
  fileName: string;
  folderPath: string;
}

export interface BillTarget {
  folderId: string;
  folderPath: string;
  fileName: string;
}

/** Builds (and creates) the year/month folder for a bill. */
export async function billTarget(input: {
  shopName: string;
  orderId: string;
  at: Date;
  rootFolderId?: string;
}): Promise<BillTarget> {
  const rootId = rootFolder(input.rootFolderId);
  if (!rootId) throw new Error(NO_DRIVE_FOLDER_MESSAGE);
  const shopFolder = await ensureFolder(rootId, input.shopName || 'Bills');
  const billsFolder = await ensureFolder(shopFolder, 'Bills');

  const year = input.at.getUTCFullYear();
  const yearFolder = await ensureFolder(billsFolder, String(year));

  const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'Asia/Kolkata' }).format(
    new Date(input.at.getTime() + 330 * 60_000),
  );
  const monthFolder = await ensureFolder(yearFolder, monthName);

  return {
    folderId: monthFolder,
    folderPath: `${input.shopName}/Bills/${year}/${monthName}`,
    fileName: `${input.orderId}.pdf`,
  };
}

async function findFile(folderId: string, fileName: string): Promise<string | null> {
  const drive = await getDrive();
  const query = [
    `name = '${fileName.replace(/'/g, "\\'")}'`,
    `'${folderId}' in parents`,
    'trashed = false',
  ].join(' and ');
  const response = await withRetry('find bill', () =>
    drive.files.list({ q: query, fields: 'files(id,name,modifiedTime)', pageSize: 5 }),
  );
  return response.data.files?.[0]?.id ?? null;
}

/**
 * Uploads a bill, or replaces the bytes of the existing one.
 * Never creates a second copy of the same Order ID.
 */
export async function saveBillPdf(
  target: BillTarget,
  content: Buffer,
): Promise<BillLocation> {
  const drive = await getDrive();
  const existingId = await findFile(target.folderId, target.fileName);

  if (existingId) {
    await withRetry('update bill', () =>
      drive.files.update({ fileId: existingId, media: { mimeType: 'application/pdf', body: content } }),
    );
    return {
      fileId: existingId,
      link: billLink(existingId),
      fileName: target.fileName,
      folderPath: target.folderPath,
    };
  }

  const created = await withRetry('upload bill', () =>
    drive.files.create({
      requestBody: { name: target.fileName, parents: [target.folderId] },
      media: { mimeType: 'application/pdf', body: content },
      fields: 'id',
    }),
  );
  const fileId = created.data.id;
  if (!fileId) throw new Error('Bill was not saved to Drive.');
  return { fileId, link: billLink(fileId), fileName: target.fileName, folderPath: target.folderPath };
}

export function billLink(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Grants access to a file or folder. One bad address never stops the others,
 * and "already shared" is treated as success so re-running setup is safe.
 */
export async function shareWithEmails(
  fileId: string,
  emails: string[],
  role: 'writer' | 'reader' = 'writer',
): Promise<number> {
  const unique = Array.from(new Set(emails.map((item) => item.trim().toLowerCase()).filter(Boolean)));
  if (unique.length === 0) return 0;

  const drive = await getDrive();
  let shared = 0;
  for (const email of unique) {
    try {
      await withRetry('share', () =>
        drive.permissions.create({
          fileId,
          sendNotificationEmail: false,
          requestBody: { type: 'user', role, emailAddress: email },
          supportsAllDrives: true,
        }),
      );
      shared += 1;
    } catch (error) {
      // 409 = the address already has access, which is exactly what we wanted.
      if ((error as { code?: number }).code === 409) {
        shared += 1;
        continue;
      }
      console.warn(
        `[drive] could not share ${fileId} with ${email}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return shared;
}

/** Used by the repair photos capture on a phone. */
export async function savePhoto(input: {
  orderId: string;
  fileName: string;
  content: Buffer;
  mimeType: string;
  rootFolderId?: string;
}): Promise<BillLocation> {
  const drive = await getDrive();
  const rootId = rootFolder(input.rootFolderId);
  if (!rootId) throw new Error(NO_DRIVE_FOLDER_MESSAGE);
  const photos = await ensureFolder(rootId, 'Repair Photos');
  const orderFolder = await ensureFolder(photos, input.orderId);

  const response = await withRetry('upload photo', () =>
    drive.files.create({
      requestBody: { name: input.fileName, parents: [orderFolder] },
      media: { mimeType: input.mimeType, body: input.content },
      fields: 'id',
    }),
  );
  const fileId = response.data.id;
  if (!fileId) throw new Error('Photo was not saved.');
  return { fileId, link: billLink(fileId), fileName: input.fileName, folderPath: `Repair Photos/${input.orderId}` };
}
