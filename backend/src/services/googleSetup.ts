import { readDriveFolderId } from '../data/connection';
import { isGoogleReady } from '../google/client';
import {
  NO_DRIVE_FOLDER_MESSAGE,
  ensureFolder,
  forgetDriveAccess,
  resetDriveCache,
  shareWithEmails,
} from '../google/drive';
import { getSettings } from './settings';

/**
 * One-time Google setup helpers used from the Sheet Sync screen.
 * Creates the bill folder tree and, optionally, shares it with the owner so
 * they can open the files in their own Google account.
 */
export async function createDriveFolderTree(shareWith: string[] = []): Promise<string> {
  if (!isGoogleReady()) {
    throw new Error('The Google service account key is not loaded on the server yet.');
  }
  const rootId = readDriveFolderId();
  if (!rootId) throw new Error(NO_DRIVE_FOLDER_MESSAGE);
  const settings = getSettings();

  const root = await ensureFolder(rootId, settings.shopName);
  await ensureFolder(root, 'Bills');
  await ensureFolder(root, 'Repair Photos');

  const emails = shareWith.map((email) => email.trim()).filter(Boolean);
  if (emails.length > 0) {
    await shareFolder(root, emails);
  }
  return root;
}

export async function shareFolder(folderId: string, emails: string[]): Promise<number> {
  return shareWithEmails(folderId, emails);
}

/** Wipes the cached folder ids so the next bill re-resolves the tree. */
export function forgetDriveFolders(): void {
  resetDriveCache();
  forgetDriveAccess();
}
