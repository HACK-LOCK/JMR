import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';

/**
 * Which Google resources the app is allowed to use.
 *
 * Both ids are kept in a small file of our own, not only in the .env file,
 * because the owner types them into the Connect Google screen. The Drive folder
 * has to be remembered here: bills are written into that folder, so a link that
 * was only used for the on-screen check would change nothing.
 *
 * Lives outside store.ts on purpose. The Google layer needs to know which
 * folder to write into, and it must not pull in the sheet store to find out.
 */
export interface ConnectionConfig {
  /** Spreadsheet chosen by the owner from the Sheet Sync screen. */
  spreadsheetId: string;
  /** Drive folder that holds the bills and the repair photos. */
  driveFolderId: string;
  /** false keeps the app on the local file even if a sheet is known. */
  useGoogle: boolean;
}

const CONFIG_FILE = path.join(env.dataDir, 'connection.json');

function fromEnv(): ConnectionConfig {
  return {
    spreadsheetId: env.google.sheetsId,
    driveFolderId: env.google.driveRootFolderId,
    useGoogle: Boolean(env.google.sheetsId),
  };
}

export function readConnection(): ConnectionConfig {
  if (!fs.existsSync(CONFIG_FILE)) return fromEnv();
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const value = parsed as Partial<ConnectionConfig>;
    return {
      spreadsheetId: (value.spreadsheetId ?? env.google.sheetsId).trim(),
      driveFolderId: (value.driveFolderId ?? env.google.driveRootFolderId).trim(),
      useGoogle: value.useGoogle ?? true,
    };
  } catch {
    return fromEnv();
  }
}

export async function writeConnection(next: Partial<ConnectionConfig>): Promise<ConnectionConfig> {
  const merged = { ...readConnection(), ...next };
  await fsp.mkdir(env.dataDir, { recursive: true });
  await fsp.writeFile(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

/**
 * The one folder every bill and photo goes into. Empty means "no folder is
 * connected", which is the normal state before Google Drive is set up.
 */
export function readDriveFolderId(): string {
  return readConnection().driveFolderId;
}
