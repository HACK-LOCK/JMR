import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Download, FileSpreadsheet, ListFilter, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorBlock, InlineNotice, LoadingBlock } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { useBillHistory } from '@/hooks/use-queries';
import { downloadProtectedFile } from '@/lib/api';
import { money, plusDaysIso, plural, todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { BillHistoryRow } from '@/lib/types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A day is only usable if it is a real one: 2026-02-31 is not a date. */
function isRealDay(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Previous bills for a day or a date range, and a spreadsheet of exactly what
 * is on screen. Nothing here writes: it reads the same bills the counter wrote.
 */
export default function BillHistory(): JSX.Element {
  const toast = useToast();
  const [mode, setMode] = useState<'day' | 'range'>('day');
  const [day, setDay] = useState(todayIso);
  const [from, setFrom] = useState(() => plusDaysIso(-29));
  const [to, setTo] = useState(todayIso);
  const [search, setSearch] = useState('');
  const [downloading, setDownloading] = useState(false);

  const activeFrom = mode === 'day' ? day : from;
  const activeTo = mode === 'day' ? day : to;

  // Checked here so a half-typed date never reaches the API, and so the reason
  // is written next to the field that caused it.
  const rangeError = !isRealDay(activeFrom)
    ? 'Choose a valid date.'
    : !isRealDay(activeTo)
      ? 'Choose a valid date.'
      : activeFrom > activeTo
        ? 'From date must be on or before To date.'
        : '';

  const ready = rangeError === '';
  const { data, isLoading, isFetching, error, refetch } = useBillHistory(
    ready ? activeFrom : '',
    ready ? activeTo : '',
  );

  const bills = data?.bills ?? [];
  const needle = search.trim().toLowerCase();
  const shown =
    needle === ''
      ? bills
      : bills.filter(
          (bill) =>
            bill.id.toLowerCase().includes(needle) ||
            bill.customerName.toLowerCase().includes(needle) ||
            bill.mobile.includes(needle.replace(/\D+/g, '')) ||
            bill.device.toLowerCase().includes(needle),
        );

  const download = async (): Promise<void> => {
    if (!ready) {
      toast.error('Check the dates', rangeError);
      return;
    }
    if (bills.length === 0) {
      // No file is written for an empty range - a blank spreadsheet is worse
      // than a sentence that says there is nothing there.
      toast.error('Nothing to download', 'No bills found for this date/range.');
      return;
    }
    setDownloading(true);
    try {
      const query = `from=${encodeURIComponent(activeFrom)}&to=${encodeURIComponent(activeTo)}`;
      await downloadProtectedFile(`/orders/history.xlsx?${query}`);
      toast.success('Excel downloaded', `${plural(bills.length, 'bill')} saved.`);
    } catch (caught) {
      toast.error(
        'Could not download',
        caught instanceof Error ? caught.message : 'Please try again.',
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="Bill History"
        subtitle={data ? `${data.from} to ${data.to}` : 'Pick a date or a range'}
        back
        action={
          <Button
            className="gap-2"
            onClick={() => void download()}
            loading={downloading}
            loadingText="Preparing"
            disabled={!ready || bills.length === 0}
          >
            <Download className="h-5 w-5" />
            <span className="hidden sm:inline">Excel</span>
          </Button>
        }
      />

      {/* One date, or a range. Both write the same question, so only one shows. */}
      <div className="grid grid-cols-2 gap-2">
        <ModeButton active={mode === 'day'} onClick={() => setMode('day')} icon={CalendarDays} label="One date" />
        <ModeButton
          active={mode === 'range'}
          onClick={() => setMode('range')}
          icon={ListFilter}
          label="Date range"
        />
      </div>

      <Card>
        <CardContent className="pt-4">
          {mode === 'day' ? (
            <div className="space-y-2">
              <label
                htmlFor="history-day"
                className="text-2xs font-bold uppercase tracking-wide text-muted-foreground"
              >
                Date
              </label>
              <input
                id="history-day"
                name="history-day"
                type="date"
                value={day}
                onChange={(event) => setDay(event.target.value)}
                className="h-12 w-full rounded-xl border-2 border-input bg-background px-3 text-base"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label
                  htmlFor="history-from"
                  className="text-2xs font-bold uppercase tracking-wide text-muted-foreground"
                >
                  From
                </label>
                <input
                  id="history-from"
                  name="history-from"
                  type="date"
                  value={from}
                  max={isRealDay(to) ? to : undefined}
                  onChange={(event) => setFrom(event.target.value)}
                  className="h-12 w-full rounded-xl border-2 border-input bg-background px-3 text-base"
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="history-to"
                  className="text-2xs font-bold uppercase tracking-wide text-muted-foreground"
                >
                  To
                </label>
                <input
                  id="history-to"
                  name="history-to"
                  type="date"
                  value={to}
                  min={isRealDay(from) ? from : undefined}
                  onChange={(event) => setTo(event.target.value)}
                  className="h-12 w-full rounded-xl border-2 border-input bg-background px-3 text-base"
                />
              </div>
            </div>
          )}

          {rangeError ? (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-destructive">
              <TriangleAlert className="h-4 w-4" /> {rangeError}
            </p>
          ) : null}

          {ready && data ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Total label="Bills" value={String(data.count)} />
              <Total label="Total" value={money(data.total)} />
              <Total label="Due" value={money(data.balance)} tone={data.balance > 0 ? 'destructive' : 'default'} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {rangeError ? null : bills.length > 12 ? (
        <input
          type="search"
          name="history-search"
          aria-label="Search the bills on screen"
          autoComplete="off"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter by bill no, name, mobile or device"
          className="h-12 w-full rounded-xl border-2 border-input bg-background px-3 text-base"
        />
      ) : null}

      {rangeError ? (
        <EmptyState
          icon={TriangleAlert}
          title="Pick a valid date"
          description={rangeError}
        />
      ) : error && !data ? (
        <ErrorBlock message={error.message} onRetry={() => void refetch()} />
      ) : isLoading && !data ? (
        <LoadingBlock label="Loading bills..." />
      ) : bills.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No bills found for this date/range"
          description="Change the date above, or write a new bill."
          action={
            <Button asChild className="gap-2">
              <Link to="/new">New Bill</Link>
            </Button>
          }
        />
      ) : (
        <>
          {isFetching ? (
            <p className="text-2xs text-muted-foreground">updating...</p>
          ) : null}
          {shown.length !== bills.length ? (
            <InlineNotice tone="info">
              {plural(shown.length, 'bill')} of {bills.length} shown. The Excel file has all{' '}
              {bills.length}.
            </InlineNotice>
          ) : null}
          <ul className="space-y-2.5">
            {shown.map((bill) => (
              <li key={bill.id}>
                <HistoryRow bill={bill} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof CalendarDays;
  label: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex min-h-[48px] items-center justify-center gap-2 rounded-xl border-2 text-sm font-bold transition-colors',
        active ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-card',
      )}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function Total({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'destructive';
}): JSX.Element {
  return (
    <div className="rounded-xl border p-2.5">
      <p className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'tabular mt-1 text-base font-black leading-none',
          tone === 'destructive' && 'text-destructive',
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** One bill: who, which device, what is still owed. Tap for the full bill. */
function HistoryRow({ bill }: { bill: BillHistoryRow }): JSX.Element {
  return (
    <div className="rounded-xl border bg-card p-3">
      <Link to={`/orders/${bill.id}`} className="block">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="tabular text-sm font-black text-primary">{bill.id}</span>
              <StatusBadge status={bill.status} />
            </div>
            <p className="mt-1 truncate text-base font-bold leading-tight">{bill.customerName}</p>
            <p className="tabular truncate text-sm text-muted-foreground">
              {bill.mobile} · {bill.device}
            </p>
            <p className="tabular mt-0.5 text-2xs text-muted-foreground">
              {bill.date} · Total {money(bill.total)} · Paid {money(bill.advance)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xs font-bold uppercase text-muted-foreground">Due</p>
            <p
              className={cn(
                'tabular text-base font-black',
                bill.balance > 0 ? 'text-destructive' : 'text-success',
              )}
            >
              {money(bill.balance)}
            </p>
          </div>
        </div>
      </Link>
    </div>
  );
}
