import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  Package,
  PlusCircle,
  Search,
  TrendingUp,
} from 'lucide-react';
import { useDashboard } from '@/hooks/use-queries';
import { PageHeader } from '@/components/app-shell';
import { ContactActions } from '@/components/contact-actions';
import { HiddenSectionsButton, SectionEye, UnhideSheet } from '@/components/dashboard-hide';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/feedback';
import { PaymentBadge } from '@/components/status-badge';
import { useHiddenDashboardSections } from '@/lib/dashboard-sections';
import type { DashboardVisibility, HiddenSection } from '@/lib/dashboard-sections';
import { dateOnly, deviceLabel, money, plural, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { OrderSummary } from '@shared/domain';

/**
 * JMR - BILLING home. Money and bills only: no stock, no suppliers, no
 * inventory numbers anywhere on this screen.
 *
 * The four figures below can be put away for a crowded counter. New Bill and
 * Search Order are never part of that - with nothing else on the screen there
 * would be no way to work.
 */
export default function Dashboard(): JSX.Element {
  const { data, isLoading, error, refetch } = useDashboard();
  const [unhideOpen, setUnhideOpen] = useState(false);
  const vis = useHiddenDashboardSections(() => setUnhideOpen(true));

  if (isLoading && !data) return <LoadingBlock label="Loading today's bills..." />;
  if (error && !data) return <ErrorBlock message={error.message} onRetry={() => void refetch()} />;
  if (!data) return <ErrorBlock message="No data available." onRetry={() => void refetch()} />;

  const hiddenCount = vis.hidden.size;

  return (
    <div className="space-y-4">
      <PageHeader
        title="JMR — BILLING"
        subtitle={`${dateOnly(new Date().toISOString())} · ${greeting()}`}
        center
        action={hiddenCount > 0 ? <HiddenSectionsButton count={hiddenCount} vis={vis} /> : undefined}
      />

      {/* Today's collection - the one number the owner opens the app for. */}
      {!vis.hidden.has('collection') && (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-2">
              <p className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide text-success">
                <TrendingUp className="h-4 w-4" /> Today&apos;s Collection
              </p>
              <SectionEye section="collection" label="Today's Collection" vis={vis} />
            </div>
            <p className="tabular mt-2 text-4xl font-black leading-none text-success md:text-5xl">
              {money(data.todayCollected)}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Cash, UPI and card received today
            </p>
          </CardContent>
        </Card>
      )}

      {/* Only two actions, and they are never hidden: make a bill, or find one. */}
      <div className="grid grid-cols-2 gap-3">
        <Button asChild size="xl" className="gap-2 shadow-md">
          <Link to="/new">
            <PlusCircle className="h-6 w-6" />
            <span className="text-center leading-tight">
              New Bill
              <span className="block text-2xs font-medium opacity-80">Start in seconds</span>
            </span>
          </Link>
        </Button>
        <Button asChild size="xl" variant="outline" className="gap-2 shadow-md">
          <Link to="/search">
            <Search className="h-6 w-6" />
            <span className="text-center leading-tight">
              Search Order
              <span className="block text-2xs font-medium opacity-70">ID, name or mobile</span>
            </span>
          </Link>
        </Button>
      </div>

      {/* Four status cards. "In Shop" and "Ready" are hidden together, because
          they are two halves of the same question: where is the device now. */}
      {!vis.hidden.has('bills') && (
        <StatCard
          section="bills"
          label="Bills Today"
          vis={vis}
          to="/orders?scope=today"
          value={data.todayRepairs}
          sub={plural(data.todayRepairs, 'bill')}
          icon={Clock}
        />
      )}

      {!vis.hidden.has('bench') && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            section="bench"
            label="In Shop"
            vis={vis}
            to="/orders?scope=active"
            value={data.onBench}
            sub="being worked on"
            icon={Package}
          />
          <StatCard
            section="bench"
            label="Ready"
            vis={vis}
            to="/orders?scope=ready"
            value={data.readyForPickup}
            sub="to give back"
            icon={CheckCircle2}
            tone={data.readyForPickup > 0 ? 'success' : 'default'}
          />
        </div>
      )}

      {!vis.hidden.has('due') && (
        <StatCard
          section="due"
          label="Money Due"
          vis={vis}
          to="/orders?scope=unpaid"
          value={money(data.pendingPaymentAmount)}
          sub={plural(data.pendingPaymentCount, 'bill')}
          icon={CreditCard}
          tone={data.pendingPaymentAmount > 0 ? 'destructive' : 'default'}
        />
      )}

      {/* Compact recent bills with call and WhatsApp right on the row. */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Recent Bills</CardTitle>
            <Button variant="ghost" size="sm" asChild className="gap-1">
              <Link to="/orders">
                All bills <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.recentOrders.length === 0 ? (
            <EmptyState
              icon={PlusCircle}
              title="No bills yet"
              description="Tap New Bill to write your first bill of the day."
              action={
                <Button asChild className="gap-2">
                  <Link to="/new">
                    <PlusCircle className="h-5 w-5" /> New Bill
                  </Link>
                </Button>
              }
            />
          ) : (
            data.recentOrders.map((order) => <CompactOrderRow key={order.id} order={order} />)
          )}
        </CardContent>
      </Card>

      <UnhideSheet open={unhideOpen} onOpenChange={setUnhideOpen} onUnlocked={vis.revealAll} />
    </div>
  );
}

/** One bill, one line, with the two buttons an employee actually taps. */
function CompactOrderRow({ order }: { order: OrderSummary }): JSX.Element {
  return (
    <div className="rounded-xl border bg-card p-3">
      <Link to={`/orders/${order.id}`} className="block">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="tabular text-sm font-black text-primary">{order.id}</span>
              <PaymentBadge status={order.paymentStatus} payable={order.payable} />
            </div>
            <p className="mt-1 truncate text-base font-bold leading-tight">{order.customerName}</p>
            <p className="tabular truncate text-sm text-muted-foreground">
              {order.mobile} · {deviceOf(order)}
            </p>
            <p className="mt-0.5 text-2xs text-muted-foreground">{timeAgo(order.receivedAt)}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="tabular text-base font-black">{money(order.payable)}</p>
            {order.balance > 0 ? (
              <p className="tabular text-2xs font-bold text-destructive">
                {money(order.balance)} due
              </p>
            ) : null}
          </div>
        </div>
      </Link>
      <ContactActions order={order} className="mt-2.5" />
    </div>
  );
}

function deviceOf(order: { brand: string; model: string; deviceType: string }): string {
  return deviceLabel(order.brand, order.model, order.deviceType);
}

function StatCard({
  section,
  label,
  vis,
  to,
  value,
  sub,
  icon: Icon,
  tone = 'default',
}: {
  section: HiddenSection;
  label: string;
  vis: DashboardVisibility;
  to: string;
  value: string | number;
  sub?: string;
  icon: typeof Clock;
  tone?: 'default' | 'success' | 'destructive';
}): JSX.Element {
  return (
    <div className="relative">
      {/* The eye sits on top of the link rather than inside it, so tapping one
          never navigates and the card stays a single big target. */}
      <SectionEye
        section={section}
        label={label}
        vis={vis}
        className="absolute right-1.5 top-1.5 z-10 bg-card/80"
      />
      <Link
        to={to}
        className={cn(
          'flex flex-col justify-between rounded-2xl border bg-card p-3.5 transition-colors active:bg-secondary',
          tone === 'success' && 'border-success/40 bg-success/5',
          tone === 'destructive' && 'border-destructive/40 bg-destructive/5',
        )}
      >
        <Icon
          className={cn(
            'h-5 w-5 text-muted-foreground',
            tone === 'success' && 'text-success',
            tone === 'destructive' && 'text-destructive',
          )}
        />
        <p
          className={cn(
            'tabular mt-3 text-2xl font-black leading-none',
            tone === 'destructive' && 'text-destructive',
          )}
        >
          {value}
        </p>
        <p className="mt-1 text-xs font-bold leading-tight">{label}</p>
        {sub ? <p className="text-2xs text-muted-foreground">{sub}</p> : null}
      </Link>
    </div>
  );
}

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(
      new Date(),
    ),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
