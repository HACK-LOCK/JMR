const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const IST_OFFSET_MINUTES = 330; // Asia/Kolkata

/** Current wall-clock date/time in the shop's timezone (IST), as an ISO-like local string. */
export function shopNow(now: Date = new Date()): Date {
  return new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
}

export function shopDateString(now: Date = new Date()): string {
  return shopNow(now).toISOString().slice(0, 10);
}

export function monthName(monthIndex: number): string {
  return MONTHS[monthIndex] ?? 'Month';
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: string): boolean {
  return DATE_ONLY.test(value.trim());
}

export function toIso(value: string | undefined, fallback = new Date()): string {
  if (!value || value.trim() === '') return fallback.toISOString();
  if (isDateOnly(value)) return `${value.trim()}T00:00:00.000Z`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback.toISOString();
  return parsed.toISOString();
}

const IST_LABEL = 'IST';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const TIME_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

export function formatDate(value: string | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return DATE_FMT.format(d).replace(/\s+/g, ' ');
}

export function formatTime(value: string | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${TIME_FMT.format(d).replace(/\s+/g, ' ')} ${IST_LABEL}`;
}

export function formatDateTime(value: string | undefined): string {
  if (!value) return '-';
  return `${formatDate(value)}, ${formatTime(value)}`;
}

export function isToday(value: string | undefined, now: Date = new Date()): boolean {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return shopDateString(d) === shopDateString(now);
}
