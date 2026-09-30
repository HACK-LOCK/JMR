import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PackageMinus, Wrench } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineNotice } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { PartPicker } from '@/components/part-picker';
import { useOrders, usePart, useStockOut, useStockReturn } from '@/hooks/use-queries';
import { plural } from '@/lib/format';
import { cn } from '@/lib/utils';

type Mode = 'out' | 'return';

/**
 * Stock Out and Part Return.
 * The Order ID field is not optional here: the server refuses repair stock
 * movements that cannot be traced back to a repair.
 */
export default function StockOut(): JSX.Element {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const stockOut = useStockOut();
  const stockReturn = useStockReturn();

  const [mode, setMode] = useState<Mode>('out');
  const [partId, setPartId] = useState(params.get('part') ?? '');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [orderId, setOrderId] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: part } = usePart(partId || undefined);
  const { data: recentOrders } = useOrders({ scope: 'active', q: '', limit: 50 });

  const qty = Number(quantity) || 0;
  const needsOrder = mode === 'out' && /repair|used|order/i.test(reason);
  const tooMuch = part ? qty > part.quantity : false;
  const valid = Boolean(partId) && qty > 0 && !tooMuch && (!needsOrder || orderId.trim().length > 0);

  const submit = async (): Promise<void> => {
    if (!valid) return;
    const payload = {
      partId,
      quantity: qty,
      reason: reason.trim() || (mode === 'out' ? 'Stock out' : 'Returned to stock'),
      orderId: orderId.trim(),
      idempotencyKey: crypto.randomUUID(),
    };
    try {
      const response =
        mode === 'out'
          ? await stockOut.mutateAsync(payload)
          : await stockReturn.mutateAsync(payload);
      if (response.warning) toast.warning(response.warning.message);
      else
        toast.success(
          mode === 'out' ? 'Stock reduced' : 'Stock returned',
          `${part?.name ?? 'Item'} now ${response.data.quantity} in stock.`,
        );
      setQuantity('1');
      setReason('');
      setOrderId('');
    } catch (caught) {
      toast.error(
        mode === 'out' ? 'Could not reduce stock' : 'Could not return stock',
        caught instanceof Error ? caught.message : undefined,
      );
    }
  };

  const busy = stockOut.isPending || stockReturn.isPending;

  return (
    <div className="space-y-4 pb-4">
      <PageHeader title="Stock Out / Return" subtitle="Manual stock movement with a full record" back />

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setMode('out');
            setReason('Used for repair');
          }}
          className={cn(
            'flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border-2 text-sm font-bold transition-colors',
            mode === 'out'
              ? 'border-destructive bg-destructive/5 text-destructive'
              : 'border-border bg-card',
          )}
        >
          <PackageMinus className="h-6 w-6" />
          Stock Out
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('return');
            setReason('Returned by customer');
          }}
          className={cn(
            'flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border-2 text-sm font-bold transition-colors',
            mode === 'return'
              ? 'border-success bg-success/5 text-success'
              : 'border-border bg-card',
          )}
        >
          <PackageMinus className="h-6 w-6 rotate-180" />
          Return
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Choose Item</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {part ? (
            <div
              className={cn(
                'rounded-xl border-2 p-3',
                part.quantity > 0 ? 'border-border' : 'border-destructive/40 bg-destructive/5',
              )}
            >
              <p className="text-base font-bold">{part.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[part.brand, part.model].filter(Boolean).join(' ') || part.category}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <p className="tabular text-sm font-semibold">
                  <span className={part.quantity === 0 ? 'text-destructive' : ''}>{part.quantity}</span> in
                  stock
                  {part.usedInOpenOrders > 0 ? (
                    <span className="ml-2 text-primary">
                      ({part.usedInOpenOrders} reserved on repairs)
                    </span>
                  ) : null}
                </p>
                <Button variant="ghost" size="sm" onClick={() => setPartId('')}>
                  Change
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="lg"
              variant="outline"
              className="h-20 w-full gap-2 border-2 border-dashed"
              onClick={() => setPickerOpen(true)}
            >
              <PackageMinus className="h-6 w-6" /> Tap to choose an item
            </Button>
          )}
        </CardContent>
      </Card>

      {partId ? (
        <Card>
          <CardHeader>
            <CardTitle>{mode === 'out' ? 'How many are leaving?' : 'How many are coming back?'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Quantity" htmlFor="stock-out-qty">
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 5, 10].map((preset) => (
                  <Button key={preset} variant="outline" onClick={() => setQuantity(String(preset))}>
                    {preset}
                  </Button>
                ))}
              </div>
              <Input
                id="stock-out-qty"
                type="number"
                inputMode="numeric"
                min={1}
                max={part?.quantity ?? undefined}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                invalid={tooMuch}
                className="mt-2 h-16 text-3xl font-black"
              />
            </Field>

            {tooMuch ? (
              <InlineNotice tone="error">
                Only {plural(part?.quantity ?? 0, 'unit')} in stock. You cannot remove {qty}.
              </InlineNotice>
            ) : null}

            <Field
              label="Reason"
              htmlFor="stock-out-reason"
              hint="Mentioning 'repair' or 'order' makes the Order ID mandatory."
            >
              <Select
                value={reason}
                onValueChange={setReason}
                options={REASON_OPTIONS[mode].map((item) => ({ value: item, label: item }))}
                allowEmpty
                emptyLabel="Other reason"
              />
              <Input
                id="stock-out-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Type the reason"
                className="mt-2"
              />
            </Field>

            <Field
              label="Order ID"
              htmlFor="stock-out-order"
              optional={!needsOrder}
              error={needsOrder && !orderId.trim() ? 'Order ID is required for repair stock' : null}
              hint="Always add it when the item went into a customer's device."
            >
              <Input
                id="stock-out-order"
                value={orderId}
                onChange={(event) => setOrderId(event.target.value.toUpperCase())}
                placeholder="ORD-2026-00001"
                className="tabular h-14"
                invalid={needsOrder && !orderId.trim()}
              />
            </Field>

            {(recentOrders ?? []).length > 0 ? (
              <div>
                <p className="mb-1.5 text-2xs font-bold uppercase text-muted-foreground">
                  Or pick from open repairs
                </p>
                <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                  {(recentOrders ?? []).slice(0, 8).map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setOrderId(order.id)}
                      className={cn(
                        'min-h-[44px] shrink-0 rounded-xl border-2 px-3 text-xs font-bold',
                        orderId === order.id ? 'border-primary bg-primary/5 text-primary' : 'border-border',
                      )}
                    >
                      <span className="tabular block">{order.id}</span>
                      <span className="block font-normal text-muted-foreground">{order.customerName}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-xl bg-secondary p-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Stock before</span>
                <span className="tabular font-semibold">{part?.quantity ?? 0}</span>
              </div>
              <div className="mt-1 flex justify-between text-sm">
                <span className="text-muted-foreground">{mode === 'out' ? 'Removing' : 'Adding back'}</span>
                <span
                  className={cn(
                    'tabular font-semibold',
                    mode === 'out' ? 'text-destructive' : 'text-success',
                  )}
                >
                  {mode === 'out' ? '-' : '+'}
                  {qty}
                </span>
              </div>
              <div className="mt-1 flex justify-between text-base font-black">
                <span>Stock after</span>
                <span className="tabular">{(part?.quantity ?? 0) + (mode === 'out' ? -qty : qty)}</span>
              </div>
            </div>

            {mode === 'out' ? (
              <InlineNotice tone="info">
                For parts used inside a repair, it is safer to add the part on the repair screen and
                tap
                <span className="font-bold"> Part Used</span>. That way stock and the repair stay in
                step.
              </InlineNotice>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <Button
                size="lg"
                variant={mode === 'out' ? 'destructive' : 'success'}
                className="gap-2"
                disabled={!valid}
                loading={busy}
                onClick={() => void submit()}
              >
                <PackageMinus className="h-5 w-5" /> {mode === 'out' ? 'Remove' : 'Return'}
              </Button>
              <Button size="lg" variant="outline" className="gap-2" onClick={() => navigate(`/parts/${partId}`)}>
                <Wrench className="h-5 w-5" /> Item history
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <PartPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(picked) => setPartId(picked.id)}
        title={mode === 'out' ? 'Which item is leaving stock?' : 'Which item is coming back?'}
      />
    </div>
  );
}

const REASON_OPTIONS: Record<Mode, string[]> = {
  out: ['Used for repair', 'Damaged in shop', 'Lifted to supplier', 'Free sample', 'Other reason'],
  return: ['Returned by customer', 'Not used, put back', 'Wrong item issued', 'Other reason'],
};
