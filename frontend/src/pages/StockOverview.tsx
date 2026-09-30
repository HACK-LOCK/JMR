import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Boxes, IndianRupee, Package, PackageMinus, PackagePlus, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorBlock, LoadingBlock } from '@/components/ui/feedback';
import { ConsumeBadge } from '@/components/status-badge';
import { useMovements, useParts, useStockSummary } from '@/hooks/use-queries';
import { money, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

const MOVEMENT_TONE = {
  IN: 'success',
  RETURN: 'success',
  OUT: 'destructive',
  ADJUST: 'muted',
} as const;

/** Stock overview: what the shop owns, what is running low, what moved today. */
export default function StockOverview(): JSX.Element {
  const [params] = useSearchParams();
  const lowOnly = params.get('low') === '1';
  const { data: summary, error, refetch } = useStockSummary();
  const { data: parts, isLoading } = useParts('', lowOnly);
  const { data: movements } = useMovements();

  if (error && !summary) return <ErrorBlock message={error.message} onRetry={() => void refetch()} />;

  const items = parts ?? [];
  const recent = (movements ?? []).slice(0, 12);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock Overview"
        subtitle="Everything on the shelf, and what moved recently"
        action={
          <Button asChild className="gap-2">
            <Link to="/stock/in">
              <PackagePlus className="h-5 w-5" />
              <span className="hidden sm:inline">Stock In</span>
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Items"
          value={String(summary?.items ?? 0)}
          icon={Package}
          to="/parts"
        />
        <SummaryCard
          label="Total Units"
          value={String(summary?.units ?? 0)}
          icon={Boxes}
          to="/parts"
        />
        <SummaryCard
          label="Stock Value"
          value={money(summary?.value ?? 0)}
          icon={IndianRupee}
          to="/parts"
        />
        <SummaryCard
          label="Low Stock"
          value={String(summary?.low ?? 0)}
          icon={AlertTriangle}
          to="/stock?low=1"
          tone={summary?.low ? 'destructive' : 'default'}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button asChild size="lg" variant="success" className="gap-2">
          <Link to="/stock/in">
            <PackagePlus className="h-5 w-5" /> Stock In
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="gap-2">
          <Link to="/stock/out">
            <PackageMinus className="h-5 w-5" /> Stock Out
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className={cn(lowOnly && 'text-destructive')}>
              {lowOnly ? 'Items running low' : 'All items'}
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/parts">Manage items</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && !parts ? (
            <LoadingBlock label="Loading stock..." />
          ) : items.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              {lowOnly
                ? 'Nothing is running low. Well stocked.'
                : 'No items yet. Add your first item to start tracking stock.'}
            </p>
          ) : (
            items.slice(0, 12).map((part) => (
              <Link key={part.id} to={`/parts/${part.id}`} className="card-tap block">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold">{part.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[part.brand, part.model].filter(Boolean).join(' ') || part.category}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <ConsumeBadge mode={part.consumeMode} />
                      {part.usedInOpenOrders > 0 ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-bold text-primary">
                          {part.usedInOpenOrders} reserved on open repairs
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        'tabular text-2xl font-black leading-none',
                        part.quantity === 0
                          ? 'text-destructive'
                          : part.low
                            ? 'text-warning-foreground'
                            : 'text-foreground',
                      )}
                    >
                      {part.quantity}
                    </p>
                    <p className="text-2xs text-muted-foreground">
                      min {part.minQuantity}
                    </p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-success" /> Recent Stock Movement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stock movement recorded yet.</p>
          ) : (
            recent.map((movement) => (
              <div key={movement.id} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{movement.partName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {movement.reason}
                    {movement.orderId ? ` - ${movement.orderId}` : ''} - {timeAgo(movement.date)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={cn(
                      'tabular rounded-lg px-2 py-0.5 text-sm font-black',
                      MOVEMENT_TONE[movement.type] === 'success' && 'bg-success/10 text-success',
                      MOVEMENT_TONE[movement.type] === 'destructive' && 'bg-destructive/10 text-destructive',
                      MOVEMENT_TONE[movement.type] === 'muted' && 'bg-muted text-muted-foreground',
                    )}
                  >
                    {movement.type === 'IN' || movement.type === 'RETURN' ? '+' : '-'}
                    {movement.quantity}
                  </span>
                  <p className="tabular text-2xs text-muted-foreground">
                    left {movement.balanceAfter}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  to,
  tone = 'default',
}: {
  label: string;
  value: string;
  icon: typeof Package;
  to: string;
  tone?: 'default' | 'destructive';
}): JSX.Element {
  return (
    <Link
      to={to}
      className={cn(
        'rounded-2xl border bg-card p-3.5 transition-colors active:bg-secondary',
        tone === 'destructive' && 'border-destructive/40 bg-destructive/5',
      )}
    >
      <Icon className={cn('h-5 w-5', tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground')} />
      <p className="tabular mt-2.5 text-2xl font-black leading-none">{value}</p>
      <p className="mt-1 text-2xs font-semibold text-muted-foreground">{label}</p>
    </Link>
  );
}
