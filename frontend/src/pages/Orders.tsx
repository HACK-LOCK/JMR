import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, ClipboardList, PlusCircle, TriangleAlert } from 'lucide-react';
import { ContactActions } from '@/components/contact-actions';
import { FilterChips, PageHeader, SearchField } from '@/components/app-shell';
import { PaymentBadge, StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorBlock, InlineNotice, LoadingBlock } from '@/components/ui/feedback';
import { useDebounced } from '@/lib/hooks';
import { useOrderReport, useOrders } from '@/hooks/use-queries';
import { dayKey, deviceLabel, money, plural, timeAgo, todayIso, plusDaysIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { OrderListItem } from '@/lib/types';

/** Short, billing-first filters. No bench jargon, no pickup counter. */
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'active', label: 'In Shop' },
  { value: 'ready', label: 'Ready' },
  { value: 'unpaid', label: 'Money Due' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

type Filter = (typeof FILTERS)[number]['value'];

/** Which date bucket a report tile puts the list into. */
type DateMode = 'none' | 'received' | 'delivered' | 'pending';

export default function Orders(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const scope = (params.get('scope') ?? 'all') as Filter;
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounced(search, 300);

  const [from, setFrom] = useState(() => plusDaysIso(-29));
  const [to, setTo] = useState(() => todayIso());
  const [dateMode, setDateMode] = useState<DateMode>('none');
  const [showDates, setShowDates] = useState(false);

  // A report tile chooses the list it belongs to, so the totals and the rows
  // always agree with each other. With no tile active, the chips decide.
  const listScope: string =
    dateMode === 'delivered' ? 'delivered' : dateMode === 'pending' ? 'active' : scope;
  const { data, isLoading, error, refetch, isFetching } = useOrders({
    scope: listScope,
    q: debounced,
    limit: 300,
  });
  const { data: report } = useOrderReport(from, to);

  const orders = useMemo(() => {
    const all = data ?? [];
    if (dateMode === 'none') return all;
    if (dateMode === 'delivered') {
      return all.filter((order) => {
        const day = dayKey(order.deliveredAt);
        return day >= from && day <= to;
      });
    }
    return all.filter((order) => {
      const day = dayKey(order.receivedAt);
      return day >= from && day <= to;
    });
  }, [data, dateMode, from, to]);

  const chooseFilter = (next: string): void => {
    setDateMode('none');
    const copy = new URLSearchParams(params);
    copy.set('scope', next);
    setParams(copy, { replace: true });
  };

  /**
   * A report tile and the chips are two ways of choosing the same list, so a
   * tile has to move both. Setting only the tile left the chip's reset
   * cancelling it on the very next render, and the tile then did nothing.
   */
  const chooseDateMode = (mode: DateMode): void => {
    const next: DateMode = dateMode === mode ? 'none' : mode;
    setDateMode(next);
    const copy = new URLSearchParams(params);
    copy.set(
      'scope',
      next === 'delivered' ? 'delivered' : next === 'pending' ? 'active' : 'all',
    );
    setParams(copy, { replace: true });
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="All Bills / Orders"
        subtitle={`${plural(orders.length, 'bill')}${isFetching ? ' · updating' : ''}`}
        action={
          <Button asChild className="gap-2">
            <Link to="/new">
              <PlusCircle className="h-5 w-5" />
              <span className="hidden sm:inline">New</span>
            </Link>
          </Button>
        }
      />

      <SearchField value={search} onChange={setSearch} placeholder="Bill no, name, mobile, device" />

      <FilterChips value={scope} onChange={chooseFilter} options={[...FILTERS]} />

      {/* From Date / To Date totals. Every tile is a shortcut into the list. */}
      <div className="rounded-2xl border bg-card shadow-sm">
        <button
          type="button"
          onClick={() => setShowDates((value) => !value)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-base font-black">
            <CalendarDays className="h-5 w-5 text-primary" /> Date Report
          </span>
          <span className="tabular text-sm font-bold text-muted-foreground">
            {from} → {to}
          </span>
        </button>

        {showDates ? (
          <div className="grid grid-cols-2 gap-2 border-t px-4 py-3">
            <label className="text-2xs font-bold uppercase text-muted-foreground" htmlFor="report-from">
              From Date
            </label>
            <label className="text-2xs font-bold uppercase text-muted-foreground" htmlFor="report-to">
              To Date
            </label>
            <input
              id="report-from"
              type="date"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
              className="h-12 rounded-xl border-2 border-input bg-background px-3 text-base"
            />
            <input
              id="report-to"
              type="date"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
              className="h-12 rounded-xl border-2 border-input bg-background px-3 text-base"
            />
          </div>
        ) : null}

        {report ? (
          <div className="grid grid-cols-2 gap-2 border-t p-3 sm:grid-cols-4">
            <ReportTile
              label="Received"
              count={report.received.count}
              amount={money(report.received.amount)}
              active={dateMode === 'received'}
              onClick={() => chooseDateMode('received')}
            />
            <ReportTile
              label="Delivered"
              count={report.delivered.count}
              amount={money(report.delivered.amount)}
              active={dateMode === 'delivered'}
              onClick={() => chooseDateMode('delivered')}
            />
            <ReportTile
              label="Pending"
              count={report.pending.count}
              amount={money(report.pending.amount)}
              active={dateMode === 'pending'}
              onClick={() => chooseDateMode('pending')}
            />
            <div className="rounded-xl border border-success/40 bg-success/5 p-2.5">
              <p className="text-2xs font-bold uppercase tracking-wide text-success">Collected</p>
              <p className="tabular mt-1 text-lg font-black leading-none text-success">
                {money(report.collected)}
              </p>
              <p className="mt-1 text-2xs text-muted-foreground">in this range</p>
            </div>
          </div>
        ) : null}
      </div>

      {dateMode !== 'none' ? (
        <InlineNotice tone="info">
          Showing {dateMode} bills between {from} and {to}.{' '}
          <button type="button" className="font-bold underline" onClick={() => chooseFilter('all')}>
            Show all
          </button>
        </InlineNotice>
      ) : null}

      {error && !data ? (
        <ErrorBlock message={error.message} onRetry={() => void refetch()} />
      ) : isLoading && !data ? (
        <LoadingBlock label="Loading bills..." />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={search ? ClipboardList : TriangleAlert}
          title={search ? 'No matching bills' : 'Nothing in this list'}
          description={
            search
              ? 'Try the bill number, mobile number or customer name.'
              : 'Change the filter above, or write a new bill.'
          }
          action={
            <Button asChild className="gap-2">
              <Link to="/new">
                <PlusCircle className="h-5 w-5" /> New Bill
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {orders.map((order) => (
            <li key={order.id}>
              <BillRow order={order} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportTile({
  label,
  count,
  amount,
  active,
  onClick,
}: {
  label: string;
  count: number;
  amount: string;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-xl border-2 p-2.5 text-left transition-colors',
        active ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary',
      )}
    >
      <p className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-lg font-black leading-none">{amount}</p>
      <p className="mt-1 text-2xs text-muted-foreground">{plural(count, 'bill')}</p>
    </button>
  );
}

/** One bill, one line, with call and WhatsApp on the row itself. */
export function BillRow({ order }: { order: OrderListItem }): JSX.Element {
  const device = deviceLabel(order.brand, order.model, order.deviceType);
  return (
    <div className="rounded-xl border bg-card p-3">
      <Link to={`/orders/${order.id}`} className="block">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="tabular text-sm font-black text-primary">{order.id}</span>
              <StatusBadge status={order.status} />
              <PaymentBadge status={order.paymentStatus} />
              {order.pendingSync ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-bold text-muted-foreground">
                  Not synced
                </span>
              ) : null}
            </div>
            <p className="mt-1 truncate text-base font-bold leading-tight">{order.customerName}</p>
            <p className="tabular truncate text-sm text-muted-foreground">
              {order.mobile} · {device}
            </p>
            <p className="mt-0.5 line-clamp-1 text-sm text-foreground/80">{order.complaint}</p>
            <p className="mt-0.5 text-2xs text-muted-foreground">{timeAgo(order.receivedAt)}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="tabular text-base font-black">{money(order.payable)}</p>
            {/* A cancelled bill is not going to be collected, so the figure under
                the total is what goes back to the customer, not money owed. */}
            {order.status === 'Cancelled' ? (
              order.paidAmount > 0 ? (
                <p className="tabular text-2xs font-bold text-destructive">
                  {money(order.paidAmount)} to return
                </p>
              ) : null
            ) : order.balance > 0 ? (
              <p className="tabular text-2xs font-bold text-destructive">{money(order.balance)} due</p>
            ) : null}
          </div>
        </div>
      </Link>
      <ContactActions order={order} className="mt-2.5" />
    </div>
  );
}
