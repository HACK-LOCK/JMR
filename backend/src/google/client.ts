import fs from 'node:fs';
import { google, type drive_v3, type sheets_v4 } from 'googleapis';
import { env } from '../config/env';

export interface GoogleClients {
  sheets: sheets_v4.Sheets;
  drive: drive_v3.Drive;
  spreadsheetId: string;
}

let cached: GoogleClients | null = null;
let cachedKey = '';

function authJson(): Record<string, unknown> | null {
  if (env.google.credentials) return env.google.credentials;
  const file = env.google.credentialsFile;
  if (!file) return null;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function isGoogleReady(): boolean {
  return Boolean(env.google.credentials ?? env.google.credentialsFile);
}

export interface CredentialInfo {
  ready: boolean;
  email: string;
  projectId: string;
  /** Which key file was loaded, so the app can show it in the app. */
  file: string;
  source: 'file' | 'env' | 'none';
}

/** Non-secret facts about the loaded key, safe to show in the app. */
export function credentialInfo(): CredentialInfo {
  const json = authJson();
  const source = env.google.credentials ? 'env' : env.google.credentialsFile ? 'file' : 'none';
  return {
    ready: Boolean(json),
    email: typeof json?.['client_email'] === 'string' ? (json['client_email'] as string) : '',
    projectId: typeof json?.['project_id'] === 'string' ? (json['project_id'] as string) : '',
    file: env.google.credentialsFile ?? '',
    source,
  };
}

/**
 * Accepts whatever the owner pastes - a full sheet link, a Drive folder link
 * or the bare ID - and returns just the ID. Sharing a link is the natural
 * thing to do, so the app must understand it.
 */
export function extractGoogleId(input: string): string {
  const raw = (input ?? '').trim();
  if (!raw) return '';

  if (!/^https?:\/\//i.test(raw) && !raw.startsWith('docs.google')) {
    return (raw.split(/[?#]/)[0] ?? '').replace(/\/+$/, '');
  }

  const fromD = /\/d\/([a-zA-Z0-9-_]+)/.exec(raw);
  if (fromD?.[1]) return fromD[1];
  const fromFolder = /\/folders\/([a-zA-Z0-9-_]+)/.exec(raw);
  if (fromFolder?.[1]) return fromFolder[1];
  const fromFile = /\/file\/d\/([a-zA-Z0-9-_]+)/.exec(raw);
  if (fromFile?.[1]) return fromFile[1];

  const segments = (raw.split('?')[0] ?? '').split('/').filter(Boolean);
  return segments[segments.length - 1] ?? '';
}

/**
 * Server-side only. Credentials never leave this process.
 * `spreadsheetIdOverride` lets the owner connect a sheet from the UI without
 * editing the .env file.
 */
export async function getClients(spreadsheetIdOverride?: string): Promise<GoogleClients> {
  const spreadsheetId = (spreadsheetIdOverride ?? env.google.sheetsId).trim();
  if (!spreadsheetId) {
    throw new Error('No Google spreadsheet is connected yet. Add the sheet link on the Sheet Sync screen.');
  }
  const key = `${spreadsheetId}:${env.google.impersonateUser}`;
  if (cached && cachedKey === key) return cached;

  const auth = buildAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });
  cached = { sheets, drive, spreadsheetId };
  cachedKey = key;
  return cached;
}

/**
 * Drive works on its own. Bills and photos must keep working on a day when the
 * spreadsheet is not connected yet, so they never ask for a sheet id.
 */
export async function getDrive(): Promise<drive_v3.Drive> {
  return google.drive({ version: 'v3', auth: buildAuth() });
}

function buildAuth(): InstanceType<typeof google.auth.JWT> {
  const json = authJson();
  if (!json) {
    throw new Error('The Google service account key is not loaded on the server yet.');
  }
  return new google.auth.JWT({
    email: (json['client_email'] as string) ?? undefined,
    key: (json['private_key'] as string)?.replace(/\\n/g, '\n'),
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
    subject: env.google.impersonateUser || undefined,
  });
}

export function spreadsheetUrl(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

/** Per-request throttling so a burst of writes never trips a quota error. */
export async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const code = (error as { code?: number }).code;
      const retryable = code === 429 || code === 500 || code === 502 || code === 503 || code === 429;
      if (!retryable || i === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * (i + 1) ** 2));
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label} failed: ${message}`);
}
