import type { ApiWarning } from '@shared/domain';

const TOKEN_KEY = 'jmmr.token';
const USER_KEY = 'jmmr.user';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: string[];

  constructor(message: string, status: number, code: string, details: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface Envelope<T> {
  data: T;
  warning?: ApiWarning;
}

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setSession(token: string, user: unknown): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* private mode - the session simply will not persist */
  }
}

export function getStoredUser<T>(): T | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
  /**
   * Set on a request that asks a question whose wrong answer is a normal result,
   * such as typing the shop PIN.
   *
   * A 401 normally means the session is gone, and the app signs the person out
   * and shows the login screen. That is the right response to a 401 everywhere
   * except here, where the person is signed in perfectly well and has simply
   * typed four wrong digits. Without this, one slip of the finger cost them their
   * session at the counter.
   */
  allowsUnauthorized?: boolean;
}

/**
 * Single place where the app talks to the API.
 * Network failures are translated into the same short sentence an employee
 * can act on - no stack traces, no jargon.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<Envelope<T>> {
  const token = getToken();
  let response: Response;

  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.formData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-Device-Id': (() => {
          try { return localStorage.getItem('jmr_device_id') || 'UNKNOWN'; } catch { return 'UNKNOWN'; }
        })(),
        'X-Device-Name': (() => {
          try { return encodeURIComponent(localStorage.getItem('jmr_device_name') || 'Web Device'); } catch { return 'Web Device'; }
        })(),
      },
      body: options.formData ? options.formData : options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError('No connection. Please check the internet and try again.', 0, 'OFFLINE');
  }

  if (response.status === 204) return { data: undefined as T };

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = payload as { error?: { message?: string; code?: string; details?: string[] } } | null;
    const status = response.status;
    if (status === 401 && !options.allowsUnauthorized) {
      clearSession();
      onUnauthorized?.();
    }
    throw new ApiError(
      body?.error?.message ?? 'Something went wrong. Please try again.',
      status,
      body?.error?.code ?? 'ERROR',
      body?.error?.details ?? [],
    );
  }

  return (payload ?? { data: undefined }) as Envelope<T>;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: 'POST', formData }),
  /**
   * For the PIN boxes only. A wrong PIN must show "Wrong PIN" and keep the
   * person signed in, never bounce them to the login screen.
   */
  postKeepingSession: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body, allowsUnauthorized: true }),
  /**
   * For anything that asks the person to prove something they already know -
   * the current password before a password change. Same reason as the PIN: a
   * wrong answer must leave them signed in and on the form.
   */
  patchKeepingSession: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body, allowsUnauthorized: true }),
};

/**
 * Saves an authenticated file straight to the device. openProtectedFile opens a
 * tab, which is right for the bill PDF the employee wants to read or print, but
 * wrong for a spreadsheet, where a tab means a blank page and no filename.
 *
 * The name comes from the server's own Content-Disposition, because the server
 * is what builds the file and already decides what it should be called. The
 * fallback is only for a response that arrives without the header.
 */
export async function downloadProtectedFile(path: string, fallbackName = 'download'): Promise<void> {
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new ApiError('No connection. Please check the internet and try again.', 0, 'OFFLINE');
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      onUnauthorized?.();
    }
    // The server already speaks in shop sentences, so its wording is the one
    // worth showing. A body that is not JSON means the server itself fell over.
    let message = 'Could not create the file. Please try again.';
    try {
      const body = (await response.json()) as { error?: { message?: string } } | null;
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* keep the default sentence */
    }
    throw new ApiError(message, response.status, 'DOWNLOAD_FAILED');
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = headerFilename(response.headers.get('Content-Disposition')) ?? fallbackName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/** The name the server asked for, read out of its Content-Disposition header. */
function headerFilename(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="?([^";]+)"?/i.exec(header);
  const name = match?.[1]?.trim();
  return name ? name : null;
}

/** Opens an authenticated file (the bill PDF) in a new tab. */
export function openProtectedFile(path: string): void {
  const token = getToken();
  const url = `/api${path}`;
  // A plain <a href> cannot carry the auth header, so fetch then blob.
  void fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then((response) => {
      if (!response.ok) throw new Error('Could not open the bill.');
      return response.blob();
    })
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      const tab = window.open(objectUrl, '_blank');
      if (!tab) {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = path.split('/').pop() ?? 'bill.pdf';
        link.click();
      }
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    })
    .catch(() => {
      window.open(url, '_blank');
    });
}
