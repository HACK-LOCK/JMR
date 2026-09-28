import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeftRight, History, Package, PackageMinus, PackagePlus, Wrench } from 'lucide-react';
import { CONSUME_MODES, CONSUME_MODE_LABELS, STOCK_MOVEMENT_LABELS } from '@shared/domain';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorBlock, InlineNotice, LoadingBlock } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { DetailRow } from '@/components/ui/table';
import { ConsumeBadge } from '@/components/status-badge';
import { useToast } from '@/components/ui/toast';
import { usePart, useStockAdjust } from '@/hooks/use-queries';
import { dateTime, money, plural } from '@/lib/format';
import { cn } from '@/lib/utils';

const TONE = {
  IN: 'success',
  RETURN: 'success',
  OUT: 'destructive',
  ADJUST: 'muted',
} as const;

/** One item: live stock, full movement history, and open reservations. */
export default function PartDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { data: part, isLoading, error, refetch } = usePart(id);

  if (isLoading && !part) return <LoadingBlock label="Loading item..." />;
  if (error && !part) return <ErrorBlock message={error.message} onRetry={() => void refetch()} />;
  if (!part) return <ErrorBlock message="Item not found." />;

  return (
    <div className="space-y-4">
      <PageHeader title={part.name} subtitle={[part.brand, part.model].filter(Boolean).join(' ') || part.category} back />

      {part.quantity === 0 ? (
        <InlineNotice tone="error">
          This item is out of stock. It cannot be used on a repair until stock comes in.
        </InlineNotice>
      ) : part.low ? (
        <InlineNotice tone="warning">
          Only {plural(part.quantity, 'unit')} left. The low stock warning level is {part.minQuantity}.
        </InlineNotice>
      ) : null}

      <Card>
        <CardContent className="space-y-2 pt-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-secondary p-3">
              <p className="text-2xs font-bold uppercase text-muted-foreground">In Stock</p>
              <p
                className={cn(
                  'tabular mt-0.5 text-2xl font-black',
                  part.quantity === 0 ? 'text-destructive' : part.low ? 'text-warning-foreground' : '',
                )}
              >
                {part.quantity}
              </p>
            </div>
            <div className="rounded-xl bg-secondary p-3">
              <p className="text-2xs font-bold uppercase text-muted-foreground">Reserved</p>
              <p className="tabular mt-0.5 text-2xl font-black text-primary">{part.usedInOpenOrders}</p>
            </div>
            <div className="rounded-xl bg-secondary p-3">
              <p className="text-2xs font-bold uppercase text-muted-foreground">Value</p>
              <p className="tabular mt-0.5 text-2xl font-black">{money(part.stockValue)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Button asChild variant="success" className="gap-2">
              <Link to={`/stock/in?part=${part.id}`}>
                <PackagePlus className="h-5 w-5" /> Stock In
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link to={`/stock/out?part=${part.id}`}>
                <PackageMinus className="h-5 w-5" /> Stock Out
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Item Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <DetailRow label="Category" value={part.category} />
          <DetailRow label="Stock reduces" value={<ConsumeBadge mode={part.consumeMode} />} />
          <DetailRow label="Supplier" value={part.supplierName || '-'} />
          <DetailRow label="Purchase cost" value={money(part.purchaseCost)} />
          <DetailRow label="Selling price" value={money(part.sellingPrice)} />
          <DetailRow label="Low stock warning" value={`${part.minQuantity} units`} />
          {part.sellingPrice > 0 && part.purchaseCost > 0 ? (
            <DetailRow
              label="Margin"
              value={`${money(part.sellingPrice - part.purchaseCost)} (${Math.round(
                ((part.sellingPrice - part.purchaseCost) / part.sellingPrice) * 100,
              )}%)`}
            />
          ) : null}
        </CardContent>
      </Card>

      {part.openOrderLines.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" /> Reserved on Open Repairs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              These are not yet in stock. They leave only when you tap
              <span className="font-bold"> Part Used </span> on that repair.
            </p>
            {part.openOrderLines.map((line) => (
              <Link
                key={line.orderId}
                to={`/orders/${line.orderId}`}
                className="flex items-center justify-between gap-3 rounded-xl border-2 border-border px-3 py-2.5"
              >
                <span className="tabular text-sm font-bold text-primary">{line.orderId}</span>
                <span className="tabular text-sm font-semibold">{line.quantity} reserved</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <CorrectStockCard partId={part.id} current={part.quantity} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" /> Stock History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {part.movements.length === 0 ? (
            <EmptyState icon={Package} title="No movement recorded" />
          ) : (
            part.movements.map((movement) => (
              <div key={movement.id} className="rounded-xl border-2 border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">
                      {STOCK_MOVEMENT_LABELS[movement.type]}
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        {movement.reason}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {dateTime(movement.date)} - {movement.user}
                      {movement.orderId ? (
                        <>
                          {' - '}
                          <Link
                            to={`/orders/${movement.orderId}`}
                            className="font-bold text-primary underline-offset-2 hover:underline"
                          >
                            {movement.orderId}
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={cn(
                        'tabular rounded-lg px-2 py-0.5 text-sm font-black',
                        TONE[movement.type] === 'success' && 'bg-success/10 text-success',
                        TONE[movement.type] === 'destructive' && 'bg-destructive/10 text-destructive',
                        TONE[movement.type] === 'muted' && 'bg-muted text-muted-foreground',
                      )}
                    >
                      {movement.type === 'IN' || movement.type === 'RETURN' ? '+' : '-'}
                      {movement.quantity}
                    </span>
                    <p className="tabular mt-0.5 text-2xs text-muted-foreground">
                      balance {movement.balanceAfter}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <ConsumeModeExplainer />
    </div>
  );
}

/** Escape hatch for counting mistakes - always leaves an audit trail. */
function CorrectStockCard({ partId, current }: { partId: string; current: number }): JSX.Element {
  const adjust = useStockAdjust(partId);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5 text-muted-foreground" /> Correct Stock Count
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          For physical counting mistakes only. Repairs and returns should use Stock In / Stock Out
          so the history stays correct.
        </p>
        <CorrectStockForm
          current={current}
          busy={adjust.isPending}
          onSubmit={(body) => adjust.mutateAsync(body)}
        />
      </CardContent>
    </Card>
  );
}

function CorrectStockForm({
  current,
  busy,
  onSubmit,
}: {
  current: number;
  busy: boolean;
  onSubmit: (body: { newQuantity: number; reason: string }) => Promise<unknown>;
}): JSX.Element {
  const toast = useToast();
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('Physical count correction');
  const qty = Number(value);
  const valid = value !== '' && Number.isFinite(qty) && qty >= 0;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setValue(event.target.value)}
          placeholder={`Now: ${current}`}
          className="h-12"
          aria-label="New quantity"
        />
        <Input
          value={reason}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setReason(event.target.value)}
          placeholder="Reason"
          className="h-12"
          aria-label="Reason"
        />
      </div>
      <Button
        variant="outline"
        className="w-full"
        loading={busy}
        disabled={!valid}
        onClick={() => {
          void onSubmit({ newQuantity: qty, reason: reason.trim() || 'Stock corrected' })
            .then(() => {
              toast.success('Stock corrected', `Now ${qty} in stock.`);
              setValue('');
            })
            .catch((caught: unknown) =>
              toast.error('Could not correct stock', caught instanceof Error ? caught.message : undefined),
            );
        }}
      >
        Set stock to this number
      </Button>
    </div>
  );
}

function ConsumeModeExplainer(): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>How this item behaves</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        {CONSUME_MODES.map((mode) => (
          <div key={mode} className="rounded-xl border-2 border-border p-3">
            <p className="font-bold text-foreground">{CONSUME_MODE_LABELS[mode]}</p>
            <p className="mt-1">
              {mode === 'PART_USED'
                ? 'Stock is reduced only when someone taps Part Used on the repair. Until then the quantity stays as it is.'
                : 'Stock is reduced automatically when the customer collects the device.'}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
