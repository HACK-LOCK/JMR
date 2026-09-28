import { round2 } from '@shared/domain';

const RUPEE = '₹';

/** Money is always shown the way a shop owner reads it: Rs. with no decimals noise. */
export function money(value: number | undefined | null): string {
  const amount = round2(Number(value ?? 0));
  const negative = amount < 0;
  const text = Math.abs(amount).toLocaleString('en-IN', {
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  });
  return `${negative ? '-' : ''}${RUPEE}${text}`;
}

export function dateOnly(value: string | undefined | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function timeOnly(value: string | undefined | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

export function dateTime(value: string | undefined | null): string {
  if (!value) return '-';
  return `${dateOnly(value)}, ${timeOnly(value)}`;
}

export function todayIso(): string {
  const now = new Date(Date.now() + 330 * 60_000);
  return now.toISOString().slice(0, 10);
}

/** YYYY-MM-DD in shop time, so a date filter matches the counter's calendar. */
export function dayKey(value: string | undefined | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export function plusDaysIso(days: number): string {
  const now = new Date(Date.now() + 330 * 60_000 + days * 86_400_000);
  return now.toISOString().slice(0, 10);
}

/** "2 hours ago" style label, so the employee can judge urgency quickly. */
export function timeAgo(value: string | undefined | null): string {
  if (!value) return '-';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '-';
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return dateOnly(value);
}

export function digitsOnly(value: string): string {
  return value.replace(/\D+/g, '');
}

export function mobileOnly(value: string): string {
  const digits = digitsOnly(value);
  return digits.length > 10 && digits.startsWith('91') ? digits.slice(-10) : digits;
}

export function isValidMobile(value: string): boolean {
  const digits = mobileOnly(value);
  return digits.length === 10 && !['0', '1'].includes(digits[0] ?? '');
}

export function deviceLabel(brand: string, model: string, fallback = 'Device'): string {
  const text = [brand, model].filter(Boolean).join(' ').trim();
  return text || fallback;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
