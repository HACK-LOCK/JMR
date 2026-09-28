import path from 'node:path';
import type { GoogleCheckItem, GoogleCheckReport } from '../../../shared/domain';
import { env } from '../config/env';
import { credentialInfo, extractGoogleId, getClients, isGoogleReady, withRetry } from './client';
import { checkDriveAccess, explainGoogleError } from './drive';

/**
 * One honest answer to "is Google actually connected?".
 *
 * Nothing here guesses. Every line is a real API call, so the checklist in the
 * app can only ever say true. Each item also carries the single next action,
 * because a red cross without a way to fix it is not useful to a shop owner.
 */

const SHARE_ROLE = 'Editor';

function item(
  id: string,
  label: string,
  state: GoogleCheckItem['state'],
  detail: string,
  fix = '',
): GoogleCheckItem {
  return { id, label, state, detail, fix };
}

function keyFileName(): string {
  if (!env.google.credentialsFile) return '';
  const relative = path.relative(env.rootDir, env.google.credentialsFile);
  return relative.startsWith('..') ? env.google.credentialsFile : relative;
}

export async function googleConnectionReport(input: {
  spreadsheetId?: string;
  driveFolderId?: string;
} = {}): Promise<GoogleCheckReport> {
  const creds = credentialInfo();
  const spreadsheetId = extractGoogleId(input.spreadsheetId ?? env.google.sheetsId);
  const items: GoogleCheckItem[] = [];

  /* 1. the key file */
  if (creds.ready) {
    items.push(
      item(
        'credentials',
        'Service account key loaded',
        'ok',
        `${creds.email}${creds.projectId ? ` (project ${creds.projectId})` : ''} from ${keyFileName() || '.env'}.`,
      ),
    );
  } else {
    items.push(
      item(
        'credentials',
        'Service account key loaded',
        'problem',
        'No usable Google service account key was found on the server.',
        'Save the downloaded JSON key as backend/service-account.json (it is found automatically, whatever the file is called).',
      ),
    );
  }

  /* 2. the spreadsheet */
  let spreadsheetTitle = '';
  if (!creds.ready) {
    items.push(item('spreadsheet', 'Spreadsheet shared with the service account', 'todo', 'Waiting for the key file.'));
  } else if (!spreadsheetId) {
    items.push(
      item(
        'spreadsheet',
        'Spreadsheet shared with the service account',
        'todo',
        'No spreadsheet chosen yet.',
        `Create a blank Google Sheet, share it with ${creds.email} as ${SHARE_ROLE}, then paste its link below.`,
      ),
    );
  } else {
    try {
      const { sheets } = await getClients(spreadsheetId);
      const meta = await withRetry('read spreadsheet', () =>
        sheets.spreadsheets.get({ spreadsheetId, fields: 'properties.title' }),
      );
      spreadsheetTitle = meta.data.properties?.title ?? '';
      items.push(
        item(
          'spreadsheet',
          'Spreadsheet shared with the service account',
          'ok',
          `"${spreadsheetTitle || 'Untitled sheet'}" is open to the service account.`,
        ),
      );
    } catch (error) {
      items.push(
        item(
          'spreadsheet',
          'Spreadsheet shared with the service account',
          'problem',
          explainGoogleError(error),
          `Open the sheet, click Share, and add ${creds.email} as ${SHARE_ROLE}. Then paste the link again.`,
        ),
      );
    }
  }

  /* 3. the Drive folder for bills and photos */
  let driveReady = false;
  let driveFolderId = '';
  let driveFolderName = '';
  if (creds.ready) {
    const access = await checkDriveAccess(input.driveFolderId);
    driveFolderId = access.folderId;
    driveFolderName = access.folderName;

    if (access.hasFolder) {
      driveReady = true;
      items.push(item('drive', 'Drive folder for bills and photos', 'ok', access.detail));
    } else if (access.folderId) {
      items.push(item('drive', 'Drive folder for bills and photos', 'problem', access.detail, access.fix));
    } else {
      items.push(
        item(
          'drive',
          'Drive folder for bills and photos',
          'todo',
          access.detail || 'No folder chosen yet, so bills and photos stay on this computer.',
          `Create a folder in your own Google Drive, share it with ${creds.email} as ${SHARE_ROLE}, then paste the folder link.`,
        ),
      );
    }
  } else {
    items.push(item('drive', 'Drive folder for bills and photos', 'todo', 'Waiting for the key file.'));
  }

  const sheetsReady = items.find((entry) => entry.id === 'spreadsheet')?.state === 'ok';
  const blocked = items.filter((entry) => entry.state === 'problem');
  const summary = blocked.length
    ? blocked[0]?.fix || blocked[0]?.detail || 'Some Google settings still need attention.'
    : sheetsReady
      ? driveReady
        ? 'Google Sheets and Drive are both connected.'
        : 'Google Sheets is connected. Bills and photos are still saved on this computer only.'
      : 'Not connected yet. Finish the steps above to keep a copy of the shop data online.';

  return {
    serviceAccountEmail: creds.email,
    credentialsFile: keyFileName(),
    spreadsheetId,
    spreadsheetTitle,
    driveFolderId,
    driveFolderName,
    items,
    sheetsReady,
    driveReady,
    summary,
  };
}

export { isGoogleReady };
