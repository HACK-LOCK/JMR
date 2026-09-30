import { useEffect, useState } from 'react';
import { CheckCircle2, Printer, Truck, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader, SearchField } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { PaymentBadge } from '@/components/status-badge';
import { useDebounced } from '@/lib/hooks';
import { useDeliverOrder, useOrders, useRecordPayment } from '@/hooks/use-queries';
import { openProtectedFile } from '@/lib/api';
import { money, plural, timeAgo } from '@/lib/format';
import { round2 } from '@shared/domain';
import { cn } from '@/lib/utils';

interface CounterOrder {
  id: string;
  name: string;
  balance: number;
}

/**
 * The pickup counter: one screen the staff uses to find a device, take the
 * remaining money, hand it over, and print the bill - in that order.
 */
export default function Pickup(): JSX.Element {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 250);
  const { data, isLoading, error, refetch } = useOrders({ scope: 'ready', q: debounced, limit: 200 });
  const [paying, setPaying] = useState<CounterOrder | null>(null);
  const [giving, setGiving] = useState<CounterOrder | null>(null);

  const orders = data ?? [];
  // Anything with money due floats to the top - that is the blocking work.
  const sorted = [...orders].sort((a, b) => {
    const due = (order: { balance: number }): number => (order.balance > 0 ? 1 : 0);
    if (due(a) !== due(b)) return due(b) - due(a);
    return a.receivedAt.localeCompare(b.receivedAt);
  });

  return (
    <div className="space-y-3">
      <PageHeader title="Pickup Counter" subtitle={`${plural(orders.length, 'device')} ready to give back`} />

      <SearchField value={search} onChange={setSearch} placeholder="Order ID, name or mobile" autoFocus />

      {error && !data ? (
        <ErrorBlock message={error.message} onRetry={() => void refetch()} />
      ) : isLoading && !data ? (
        <LoadingBlock label="Loading ready devices..." />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No devices waiting"
          description={
            search
              ? 'No ready device matches this search.'
              : 'Mark a repair as Ready and it will show up here for pickup.'
          }
          action={
            <Button asChild variant="outline">
              <Link to="/orders?scope=ready">View ready list</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {sorted.map((order) => (
            <li key={order.id}>
              <Card className={cn(order.balance > 0 && 'border-destructive/40')}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="tabular text-sm font-black text-primary">{order.id}</span>
                        <PaymentBadge status={order.paymentStatus} />
                        {order.balance > 0 ? (
                          <span className="rounded-full bg-destructive px-2 py-0.5 text-2xs font-black text-destructive-foreground">
                            Pay first
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-2xs font-bold text-success">
                            <CheckCircle2 className="h-3 w-3" /> Money complete
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 truncate text-lg font-black leading-tight">{order.customerName}</p>
                      <p className="tabular truncate text-sm text-muted-foreground">
                        {order.mobile} - {[order.brand, order.model].filter(Boolean).join(' ')}
                      </p>
                      {order.accessories ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          Accessories: {order.accessories}
                        </p>
                      ) : null}
                      <p className="mt-1 text-2xs text-muted-foreground">
                        Received {timeAgo(order.receivedAt)}
                        {order.expectedDelivery ? ` - promised ${order.expectedDelivery}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-lg font-black">{money(order.finalAmount)}</p>
                      {order.balance > 0 ? (
                        <p className="tabular text-sm font-black text-destructive">{money(order.balance)} due</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      variant={order.balance > 0 ? 'destructive' : 'outline'}
                      className="gap-1.5"
                      onClick={() =>
                        setPaying({ id: order.id, name: order.customerName, balance: order.balance })
                      }
                    >
                      <Wallet className="h-4 w-4" />
                      {order.balance > 0 ? `Take ${money(order.balance)}` : 'Add payment'}
                    </Button>
                    <Button
                      variant="success"
                      className="gap-1.5"
                      disabled={order.balance > 0}
                      onClick={() => setGiving({ id: order.id, name: order.customerName, balance: order.balance })}
                    >
                      <Truck className="h-4 w-4" /> Give Device
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    className="mt-1.5 w-full gap-1.5"
                    onClick={() => openProtectedFile(`/orders/${order.id}/bill.pdf`)}
                  >
                    <Printer className="h-4 w-4" /> Print Bill
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <PickupSheets
        paying={paying}
        giving={giving}
        onClosePay={() => setPaying(null)}
        onCloseGive={() => setGiving(null)}
      />
    </div>
  );
}

function PickupSheets({
  paying,
  giving,
  onClosePay,
  onCloseGive,
}: {
  paying: CounterOrder | null;
  giving: CounterOrder | null;
  onClosePay: () => void;
  onCloseGive: () => void;
}): JSX.Element {
  const toast = useToast();
  const recordPayment = useRecordPayment(paying?.id ?? '');
  const deliver = useDeliverOrder(giving?.id ?? '');

  const pay = async (amount: number): Promise<void> => {
    if (!paying) return;
    try {
      const response = await recordPayment.mutateAsync({
        amount,
        mode: 'Cash',
        note: 'Pickup counter',
        idempotencyKey: crypto.randomUUID(),
      });
      if (response.warning) toast.warning(response.warning.message);
      else toast.success('Payment saved', `${money(amount)} received from ${paying.name}`);
      onClosePay();
    } catch (caught) {
      toast.error('Could not save the payment', caught instanceof Error ? caught.message : undefined);
    }
  };

  const give = async (deliveredTo: string): Promise<void> => {
    if (!giving) return;
    try {
      const response = await deliver.mutateAsync(deliveredTo);
      if (response.warning) toast.warning(response.warning.message);
      else toast.success('Device handed over', 'Print the bill and keep a copy.');
      onCloseGive();
    } catch (caught) {
      toast.error('Could not complete the delivery', caught instanceof Error ? caught.message : undefined);
    }
  };

  return (
    <>
      <QuickPaymentSheet
        open={Boolean(paying)}
        onOpenChange={(open) => {
          if (!open) onClosePay();
        }}
        name={paying?.name ?? ''}
        balance={paying?.balance ?? 0}
        busy={recordPayment.isPending}
        onPay={pay}
      />
      <QuickGiveSheet
        open={Boolean(giving)}
        onOpenChange={(open) => {
          if (!open) onCloseGive();
        }}
        name={giving?.name ?? ''}
        balance={giving?.balance ?? 0}
        busy={deliver.isPending}
        onGive={give}
      />
    </>
  );
}

function QuickPaymentSheet({
  open,
  onOpenChange,
  name,
  balance,
  busy,
  onPay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  balance: number;
  busy: boolean;
  onPay: (amount: number) => Promise<void>;
}): JSX.Element {
  const [amount, setAmount] = useState('');

  // Pre-fill with the full balance whenever the sheet opens.
  useEffect(() => {
    if (open) setAmount(balance > 0 ? String(balance) : '');
  }, [open, balance]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Take payment from ${name}`}
      description={balance > 0 ? `${money(balance)} is due` : 'Extra or advance payment'}
    >
      <div className="space-y-3 pb-2">
        <Field label="Amount" htmlFor="quick-amount">
          <Input
            id="quick-amount"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="h-16 text-2xl font-black"
          />
        </Field>
        {balance > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setAmount(String(balance))}>
              Full {money(balance)}
            </Button>
            <Button variant="outline" onClick={() => setAmount(String(round2(balance / 2)))}>
              Half {money(round2(balance / 2))}
            </Button>
          </div>
        ) : null}
        <Button
          size="lg"
          className="w-full gap-2"
          loading={busy}
          onClick={() => {
            const value = round2(Number(amount) || 0);
            if (value <= 0) return;
            void onPay(value);
          }}
        >
          <Wallet className="h-5 w-5" /> Save Payment
        </Button>
      </div>
    </Sheet>
  );
}

function QuickGiveSheet({
  open,
  onOpenChange,
  name,
  balance,
  busy,
  onGive,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  balance: number;
  busy: boolean;
  onGive: (deliveredTo: string) => Promise<void>;
}): JSX.Element {
  const [deliveredTo, setDeliveredTo] = useState(name);

  useEffect(() => {
    if (open) setDeliveredTo(name);
  }, [open, name]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Give device to ${name}`}
      description="Stock of folders and packaging is reduced now."
    >
      <div className="space-y-3 pb-2">
        <Field label="Handed over to" htmlFor="quick-delivered-to">
          <Input
            id="quick-delivered-to"
            value={deliveredTo}
            onChange={(event) => setDeliveredTo(event.target.value)}
            className="h-14"
          />
        </Field>
        <Button
          size="lg"
          variant="success"
          className="w-full gap-2"
          disabled={balance > 0}
          loading={busy}
          onClick={() => void onGive(deliveredTo.trim())}
        >
          <CheckCircle2 className="h-5 w-5" /> Confirm Delivery
        </Button>
        {balance > 0 ? (
          <p className="text-center text-sm font-semibold text-destructive">
            {money(balance)} is still due. Take the payment first.
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
