import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PackagePlus, ScanLine } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineNotice } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { PartPicker } from '@/components/part-picker';
import { usePart, useStockIn } from '@/hooks/use-queries';
import { money, plural } from '@/lib/format';

/** Stock In: goods arrived from a supplier. */
export default function StockIn(): JSX.Element {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const stockIn = useStockIn();

  const [partId, setPartId] = useState(params.get('part') ?? '');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const { data: part } = usePart(partId || undefined);
  const qty = Number(quantity) || 0;
  const valid = Boolean(partId) && qty > 0;

  // Prefill the reason the first time an item is chosen.
  useEffect(() => {
    if (part && !reason) setReason(`${qty || 1} received from ${part.supplierName || 'supplier'}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partId]);

  const submit = async (): Promise<void> => {
    if (!valid) return;
    try {
      const response = await stockIn.mutateAsync({
        partId,
        quantity: qty,
        reason: reason.trim() || 'Stock received',
        idempotencyKey,
      });
      if (response.warning) toast.warning(response.warning.message);
      else
        toast.success(
          'Stock added',
          `${plural(qty, 'unit')} of ${part?.name ?? 'item'} - now ${response.data.quantity} in stock.`,
        );
      setQuantity('1');
      setReason('');
      setIdempotencyKey(crypto.randomUUID());
    } catch (caught) {
      toast.error('Could not add stock', caught instanceof Error ? caught.message : undefined);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <PageHeader title="Stock In" subtitle="Goods received from a supplier" back />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-success" /> Choose Item
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {part ? (
            <div className="rounded-xl border-2 border-success bg-success/5 p-3">
              <p className="text-base font-bold text-success">{part.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[part.brand, part.model].filter(Boolean).join(' ') || part.category}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <p className="tabular text-sm font-semibold">
                  Currently <span className="font-black">{part.quantity}</span> in stock
                </p>
                <Button variant="ghost" size="sm" onClick={() => setPartId('')}>
                  Change
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="lg"
              className="h-20 w-full gap-2 border-2 border-dashed"
              variant="outline"
              onClick={() => setPickerOpen(true)}
            >
              <PackagePlus className="h-6 w-6" /> Tap to choose an item
            </Button>
          )}
        </CardContent>
      </Card>

      {partId ? (
        <Card>
          <CardHeader>
            <CardTitle>How many arrived?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Quantity Received" htmlFor="stock-in-qty">
              <div className="grid grid-cols-4 gap-2">
                {[1, 5, 10, 25].map((preset) => (
                  <Button key={preset} variant="outline" onClick={() => setQuantity(String(preset))}>
                    {preset}
                  </Button>
                ))}
              </div>
              <Input
                id="stock-in-qty"
                type="number"
                inputMode="numeric"
                min={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="mt-2 h-16 text-3xl font-black"
              />
            </Field>

            <Field label="Note" htmlFor="stock-in-reason" optional hint="Supplier invoice, bill number...">
              <Input
                id="stock-in-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Received from supplier"
              />
            </Field>

            <div className="rounded-xl bg-secondary p-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Stock before</span>
                <span className="tabular font-semibold">{part?.quantity ?? 0}</span>
              </div>
              <div className="mt-1 flex justify-between text-sm">
                <span className="text-muted-foreground">Adding</span>
                <span className="tabular font-semibold text-success">+{qty}</span>
              </div>
              <div className="mt-1 flex justify-between text-base font-black">
                <span>Stock after</span>
                <span className="tabular">{(part?.quantity ?? 0) + qty}</span>
              </div>
              {part && part.purchaseCost > 0 ? (
                <p className="tabular mt-1 border-t pt-1 text-xs text-muted-foreground">
                  Value added: {money(qty * part.purchaseCost)}
                </p>
              ) : null}
            </div>

            <InlineNotice tone="info">
              Stock is added straight away and recorded in the item history with your name.
            </InlineNotice>

            <Button
              size="xl"
              variant="success"
              className="w-full gap-2"
              disabled={!valid}
              loading={stockIn.isPending}
              loadingText="Adding stock..."
              onClick={() => void submit()}
            >
              <PackagePlus className="h-5 w-5" /> Add {qty > 0 ? plural(qty, 'unit') : 'stock'}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate('/stock')}>
              Back to stock overview
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <PartPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(picked) => {
          setPartId(picked.id);
          setReason('');
        }}
        title="Which item arrived?"
      />
    </div>
  );
}
