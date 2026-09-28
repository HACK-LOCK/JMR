import crypto from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid mix-ups

/** Short, sortable, collision resistant id with a readable prefix. */
export function newId(prefix: string): string {
  const time = Date.now().toString(36).toUpperCase().padStart(9, '0');
  const rand = crypto.randomBytes(5).toString('hex').toUpperCase();
  return `${prefix}-${time}${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Shop bill number. One continuous sequence for the whole shop: JMR-0001 */
export const ORDER_ID_PREFIX = 'JMR';
/** Zero padding grows automatically past 9999 (JMR-10000). */
export const ORDER_ID_MIN_DIGITS = 4;

export function formatOrderId(sequence: number): string {
  return `${ORDER_ID_PREFIX}-${String(sequence).padStart(ORDER_ID_MIN_DIGITS, '0')}`;
}

/**
 * Reads the number out of an order id. Understands the current global
 * `JMR-0001` format and the old yearly `ORD-2026-00001` rows, so old bills keep
 * working and a restored backup can never make us reuse a number.
 */
export function parseOrderSequence(orderId: string): { year: number | null; sequence: number } | null {
  const id = orderId.trim().toUpperCase();
  const current = new RegExp(`^${ORDER_ID_PREFIX}-(\\d{1,9})$`).exec(id);
  if (current) {
    const sequence = Number(current[1]);
    return Number.isFinite(sequence) ? { year: null, sequence } : null;
  }
  const legacy = /^ORD-(\d{4})-(\d{1,9})$/.exec(id);
  if (!legacy) return null;
  const year = Number(legacy[1]);
  const sequence = Number(legacy[2]);
  if (!Number.isFinite(year) || !Number.isFinite(sequence)) return null;
  return { year, sequence };
}

/** Highest number already used by any order id, old format included. */
export function highestOrderSequence(orderIds: string[]): number {
  return orderIds.reduce(
    (max, id) => Math.max(max, parseOrderSequence(id)?.sequence ?? 0),
    0,
  );
}

/** Digits only, keeps leading zeros as typed. */
export function digitsOnly(value: string): string {
  return value.replace(/\D+/g, '');
}

/** Indian mobile numbers are 10 digits; tolerate 91 prefix and separators. */
export function normalizeMobile(value: string): string {
  let digits = digitsOnly(value);
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(-10);
  return digits;
}

export function isValidIndianMobile(value: string): boolean {
  const digits = normalizeMobile(value);
  return digits.length === 10 && digits[0] !== '0' && digits[0] !== '1';
}

export function escapeCsv(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCsv).join(',')];
  for (const row of rows) lines.push(row.map(escapeCsv).join(','));
  return lines.join('\r\n');
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
