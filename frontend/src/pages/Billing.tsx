import { useEffect, useState } from 'react';
import { CreditCard, Printer, TrendingUp, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader, SearchField } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/feedback';
import { Sheet } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { PaymentBadge } from '@/components/status-badge';
import { useDebounced } from '@/lib/hooks';
import { useOrders, useRecordPayment } from '@/hooks/use-queries';
import { openProtectedFile } from '@/lib/api';
import { money, plural, timeAgo } from '@/lib/format';
import { round2 } from '@shared/domain';
import { cn } from '@/lib/utils';

/**
 * Money desk: everything the shop is owed, what came in today, and a fast
 * way to record a payment without opening the whole repair.
 */
export default function Billing(): JSX.Element {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 250);
  const { data, isLoading, error, refetch } = useOrders({ scope: 'unpaid', q: debounced, limit: 300 });
  const [paying, setPaying] = useState<{ id: string; name: string; balance: number } | null>(null);

  const orders = data ?? [];
  const totalDue = round2(orders.reduce((sum, order) => sum + order.balance, 0));
  const collected = round2(orders.reduce((sum, order) => sum + order.paidAmount, 0));
  const partiallyPaid = orders.filter((order) => order.paidAmount > 0 && order.balance > 0).length;

  return (
    <div className="space-y-3">
      <PageHeader title="Billing" subtitle="Payments and money still due" />

      <div className="grid grid-cols-2 gap-3">
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-4">
            <p className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide text-destructive">
              <CreditCard className="h-4 w-4" /> Total Due
            </p>
            <p className="tabular mt-2 text-3xl font-black leading-none text-destructive">{money(totalDue)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Across {plural(orders.length, 'repair')}</p>
          </CardContent>
        </Card>
        <Card className="border-success/40 bg-success/5">
          <CardContent className="pt-4">
            <p className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide text-success">
              <TrendingUp className="h-4 w-4" /> Collected
            </p>
            <p className="tabular mt-2 text-3xl font-black leading-none text-success">
              {money(collected)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {partiallyPaid > 0 ? `${plural(partiallyPaid, 'order')} partly paid` : 'No partial payments'}
            </p>
          </CardContent>
        </Card>
      </div>

      <SearchField value={search} onChange={setSearch} placeholder="Name, mobile or order ID" />

      {error && !data ? (
        <ErrorBlock message={error.message} onRetry={() => void refetch()} />
      ) : isLoading && !data ? (
        <LoadingBlock label="Loading pending payments..." />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nothing pending"
          description="Every repair is fully paid. Nothing to collect today."
        />
      ) : (
        <ul className="space-y-2.5">
          {orders.map((order) => (
            <li key={order.id}>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="tabular text-sm font-black text-primary">{order.id}</span>
                        <PaymentBadge status={order.paymentStatus} />
                      </div>
                      <p className="mt-1.5 truncate text-base font-bold">{order.customerName}</p>
                      <p className="tabular truncate text-sm text-muted-foreground">
                        {order.mobile} - {[order.brand, order.model].filter(Boolean).join(' ')}
                      </p>
                      <p className="mt-0.5 text-2xs text-muted-foreground">
                        Received {timeAgo(order.receivedAt)} - paid {money(order.paidAmount)} of{' '}
                        {money(order.payable)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-lg font-black text-destructive">{money(order.balance)}</p>
                      <p className="text-2xs text-muted-foreground">due</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      className="gap-1.5"
                      onClick={() => setPaying({ id: order.id, name: order.customerName, balance: order.balance })}
                    >
                      <Wallet className="h-4 w-4" /> Take Payment
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => openProtectedFile(`/orders/${order.id}/bill.pdf`)}
                    >
                      <Printer className="h-4 w-4" /> Bill
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <QuickPaySheet target={paying} onClose={() => setPaying(null)} />
    </div>
  );
}

function QuickPaySheet({
  target,
  onClose,
}: {
  target: { id: string; name: string; balance: number } | null;
  onClose: () => void;
}): JSX.Element {
  const toast = useToast();
  const recordPayment = useRecordPayment(target?.id ?? '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  // Reset the form each time the sheet opens for a different repair.
  useEffect(() => {
    setAmount(target && target.balance > 0 ? String(target.balance) : '');
    setNote('');
  }, [target?.id, target?.balance, setAmount, setNote]);

  const save = async (): Promise<void> => {
    const value = round2(Number(amount) || 0);
    if (value <= 0) {
      toast.error('Enter the amount received');
      return;
    }
    try {
      const response = await recordPayment.mutateAsync({
        amount: value,
        mode: 'Cash',
        note: note.trim(),
        idempotencyKey: crypto.randomUUID(),
      });
      if (response.warning) toast.warning(response.warning.message);
      else toast.success('Payment recorded', `${money(value)} received`);
      setAmount('');
      setNote('');
      onClose();
    } catch (caught) {
      toast.error('Could not save the payment', caught instanceof Error ? caught.message : undefined);
    }
  };

  return (
    <Sheet
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Payment from ${target?.name ?? ''}`}
      description={target ? `${money(target.balance)} is due` : ''}
    >
      <div className="space-y-3 pb-2">
        <Field label="Amount Received" htmlFor="billing-amount">
          <Input
            id="billing-amount"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="h-16 text-2xl font-black"
          />
        </Field>
        {target && target.balance > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setAmount(String(target.balance))}>
              Full {money(target.balance)}
            </Button>
            <Button variant="outline" onClick={() => setAmount(String(round2(target.balance / 2)))}>
              Half {money(round2(target.balance / 2))}
            </Button>
          </div>
        ) : null}
        <Field label="Note" htmlFor="billing-note" optional>
          <Input
            id="billing-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="UPI reference, cash in hand..."
          />
        </Field>
        <Button
          size="lg"
          className={cn('w-full')}
          loading={recordPayment.isPending}
          onClick={() => void save()}
        >
          <Wallet className="h-5 w-5" /> Save Payment
        </Button>
        <Button variant="ghost" className="w-full" asChild>
          <Link to={target ? `/orders/${target.id}` : '/'}>Open full repair details</Link>
        </Button>
      </div>
    </Sheet>
  );
}
