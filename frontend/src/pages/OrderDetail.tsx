import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Banknote,
  CheckCircle2,
  Clock,
  CloudUpload,
  ExternalLink,
  FileText,
  History,
  Package,
  Pencil,
  Phone,
  Plus,
  Printer,
  Trash2,
  Truck,
  Wallet,
} from 'lucide-react';
import {
  COUNTER_STATUSES,
  DEVICE_CONDITIONS,
  DEVICE_TYPES,
  PAYMENT_MODES,
  type OrderStatus,
  round2,
} from '@shared/domain';
import { PageHeader } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea, numberPad } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
  import { Select } from '@/components/ui/select';
  import { ProblemField } from '@/components/problem-field';
  import { BrandField, ModelField } from '@/components/device-fields';
import { DetailRow } from '@/components/ui/table';
import { ErrorBlock, InlineNotice, LoadingBlock } from '@/components/ui/feedback';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { PaymentBadge, StatusBadge } from '@/components/status-badge';
import { ContactActions } from '@/components/contact-actions';
import { api, openProtectedFile } from '@/lib/api';
import {
  useAddOrderPart,
  useChangeStatus,
  useDeleteOrderPart,
  useDeletePayment,
  useDeliverOrder,
  useOrder,
  useParts,
  useRecordPayment,
  useUpdateOrder,
} from '@/hooks/use-queries';
import { useDebounced } from '@/lib/hooks';
import { dateOnly, dateTime, deviceLabel, money } from '@/lib/format';
import type { PartListItem } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function OrderDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const { data: order, isLoading, error, refetch } = useOrder(id);

  const [statusOpen, setStatusOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [partOpen, setPartOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(params.get('new') === '1');

  const changeStatus = useChangeStatus(id ?? '');
  const deliver = useDeliverOrder(id ?? '');
  const addPart = useAddOrderPart(id ?? '');
  const deletePart = useDeleteOrderPart(id ?? '');
  const removePayment = useDeletePayment(id ?? '');
  const recordPayment = useRecordPayment(id ?? '');
  const update = useUpdateOrder(id ?? '');

  if (isLoading && !order) return <LoadingBlock label="Loading bill..." />;
  if (error && !order) {
    return (
      <ErrorBlock
        message={error.message}
        onRetry={() => void refetch()}
      />
    );
  }
  if (!order) return <ErrorBlock message="Bill not found." />;

  const closed = order.status === 'Delivered' || order.status === 'Cancelled' || order.status === 'Unable to Repair';
  const cancelled = order.status === 'Cancelled';

  const pickStatus = async (status: OrderStatus): Promise<void> => {
    if (status === 'Delivered') {
      setStatusOpen(false);
      setDeliverOpen(true);
      return;
    }
    try {
      const response = await changeStatus.mutateAsync(status);
      setStatusOpen(false);
      if (response.warning) toast.warning(response.warning.message);
      else toast.success(`Marked as ${status}`);
    } catch (caught) {
      toast.error('Could not change status', caught instanceof Error ? caught.message : undefined);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <PageHeader
        title={order.customerName}
        subtitle={`${order.id} - ${deviceLabel(order.brand, order.model, order.deviceType)}`}
        back
        action={<StatusBadge status={order.status} size="lg" />}
      />

      {order.pendingSync ? (
        <InlineNotice tone="warning">
          This bill is saved on the device but is not yet in Google Sheets. It will go up
          automatically, or you can retry from Sheet Sync.
        </InlineNotice>
      ) : null}

      <ContactActions order={order} size="md" />

      {/* Money summary. A cancelled bill keeps what was paid on it, so the third
          figure is the money going back rather than a balance still to collect -
          the server refuses payments on a cancelled bill, so offering to take
          one would be a button that always fails. */}
      <Card>
        <CardContent className="space-y-2 pt-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <MoneyCell label="Total" value={money(order.finalAmount)} />
            <MoneyCell
              label={cancelled ? 'Received' : 'Paid'}
              value={money(order.paidAmount)}
              tone="success"
            />
            <MoneyCell
              label={cancelled ? 'To return' : 'Balance'}
              value={money(cancelled ? order.paidAmount : order.balance)}
              tone={cancelled ? 'destructive' : order.balance > 0 ? 'destructive' : 'success'}
            />
          </div>
          {order.discount > 0 ? (
            <p className="tabular text-center text-xs text-muted-foreground">
              Discount given: {money(order.discount)} (payable {money(order.payable)})
            </p>
          ) : null}
          <div className="flex flex-wrap justify-center gap-1.5 pt-1">
            {cancelled ? (
              <Badge variant="destructive">Return {money(order.paidAmount)} to customer</Badge>
            ) : (
              <PaymentBadge status={order.paymentStatus} />
            )}
            {order.paymentMode && order.paidAmount > 0 ? (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
                {order.paymentMode}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Primary actions */}
      {!closed ? (
        <div className="grid grid-cols-2 gap-2.5">
          <Button size="lg" className="gap-2" onClick={() => setStatusOpen(true)}>
            <Clock className="h-5 w-5" /> Change Status
          </Button>
          <Button
            size="lg"
            variant={order.balance > 0 ? 'destructive' : 'success'}
            className="gap-2"
            onClick={() => (order.balance > 0 ? setPaymentOpen(true) : setDeliverOpen(true))}
          >
            {order.balance > 0 ? <Wallet className="h-5 w-5" /> : <Truck className="h-5 w-5" />}
            {order.balance > 0 ? 'Take Payment' : 'Give Device'}
          </Button>
        </div>
      ) : (
        <InlineNotice tone={cancelled ? 'warning' : order.status === 'Delivered' ? 'success' : 'info'}>
          This bill is closed ({order.status}). {order.deliveredAt ? `Closed on ${dateOnly(order.deliveredAt)}.` : ''}
          {cancelled && order.paidAmount > 0
            ? ` ${money(order.paidAmount)} was taken on this bill and has to be returned to the customer.`
            : ''}
          {cancelled ? ' The bill, its parts and its history are all kept as they are.' : ''}
        </InlineNotice>
      )}

      {closed ? (
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="outline" className="gap-2" onClick={() => openProtectedFile(`/orders/${order.id}/bill.pdf`)}>
            <Printer className="h-5 w-5" /> Print Bill
          </Button>
          {cancelled ? null : order.balance > 0 ? (
            <Button className="gap-2" onClick={() => setPaymentOpen(true)}>
              <Wallet className="h-5 w-5" /> Collect Due
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Customer & device */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Device Details</CardTitle>
            {!closed ? (
              <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          <DetailRow
            label="Customer"
            value={
              <button
                type="button"
                onClick={() => navigate(`/customers/${order.customerId}`)}
                className="font-bold text-primary underline-offset-2 hover:underline"
              >
                {order.customerName}
              </button>
            }
          />
          <DetailRow
            label="Mobile"
            value={
              <a
                href={`tel:${order.mobile}`}
                className="tabular inline-flex items-center gap-1.5 font-bold text-primary underline-offset-2 hover:underline"
              >
                <Phone className="h-4 w-4" /> {order.mobile}
              </a>
            }
          />
          <DetailRow label="Device" value={deviceLabel(order.brand, order.model, order.deviceType)} />
          <DetailRow label="Type" value={order.deviceType} />
          <DetailRow label="Condition" value={order.deviceCondition} />
          {order.imei ? <DetailRow label="IMEI" value={<span className="tabular">{order.imei}</span>} /> : null}
          {order.accessories ? <DetailRow label="Accessories" value={order.accessories} /> : null}
          <DetailRow label="Problem" value={<span className="text-left">{order.complaint}</span>} />
          {order.technician ? <DetailRow label="Technician" value={order.technician} /> : null}
          {order.expectedDelivery ? (
            <DetailRow label="Expected" value={dateOnly(order.expectedDelivery)} />
          ) : null}
          <DetailRow label="Received" value={dateTime(order.receivedAt)} />
          {order.notes ? <DetailRow label="Notes" value={<span className="text-left">{order.notes}</span>} /> : null}
        </CardContent>
      </Card>

      {/*
        What the customer was charged for. Anything about how many are on the
        shelf lives in JMR - STOCK, so none of it is shown here.
      */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" /> Items on this bill
            </CardTitle>
            {!closed ? (
              <Button variant="outline" size="sm" onClick={() => setPartOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" /> Add
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {order.parts.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Nothing added to this bill yet.
            </p>
          ) : (
            order.parts.map((line) => (
              <div key={line.id} className="flex items-start justify-between gap-2 rounded-xl border-2 border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{line.partName}</p>
                  <p className="tabular text-xs text-muted-foreground">
                    {line.quantity} x {money(line.unitPrice)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <p className="tabular text-sm font-black">
                    {money(line.quantity * line.unitPrice)}
                  </p>
                  {!closed ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${line.partName}`}
                      loading={deletePart.isPending}
                      onClick={() => {
                        if (window.confirm(`Remove ${line.partName} from this bill?`)) {
                          void deletePart.mutateAsync(line.id).catch((caught: unknown) =>
                            toast.error('Could not remove', caught instanceof Error ? caught.message : undefined),
                          );
                        }
                      }}
                      className="text-destructive"
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Payments */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-success" /> Payments
            </CardTitle>
            {order.paidAmount > 0 || order.finalAmount > 0 ? (
              <Button variant="outline" size="sm" onClick={() => setPaymentOpen(true)} className="gap-1.5">
                <Wallet className="h-4 w-4" /> {order.balance > 0 ? 'Take payment' : 'Add payment'}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {order.payments.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
              No payment received yet.
            </p>
          ) : (
            order.payments.map((payment) => (
              <PaymentRow
                key={payment.id}
                payment={payment}
                onDelete={
                  closed
                    ? undefined
                    : () => {
                        if (window.confirm(`Remove this ${money(payment.amount)} payment?`)) {
                          void removePayment
                            .mutateAsync(payment.id)
                            .then(() => toast.success('Payment removed'))
                            .catch((caught: unknown) =>
                              toast.error(
                                'Could not remove payment',
                                caught instanceof Error ? caught.message : undefined,
                              ),
                            );
                        }
                      }
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Bill */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Bill / Job Card
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => openProtectedFile(`/orders/${order.id}/bill.pdf`)}
          >
            <Printer className="h-5 w-5" /> Open / Print Bill PDF
          </Button>
          <BillActions orderId={order.id} hasDrive={Boolean(order.billDriveLink)} />
          {order.billDriveLink ? (
            <a
              href={order.billDriveLink}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-border px-4 py-3 text-sm font-semibold"
            >
              <ExternalLink className="h-4 w-4" /> Open in Google Drive
            </a>
          ) : null}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" /> Status History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {order.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No status changes recorded.</p>
          ) : (
            <ol className="space-y-3">
              {[...order.history].reverse().map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                    <span className="w-0.5 flex-1 bg-border" />
                  </div>
                  <div className="min-w-0 flex-1 pb-1">
                    <p className="text-sm font-bold">
                      {entry.fromStatus ? `${entry.fromStatus} - ` : 'Created - '}
                      {entry.toStatus}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dateTime(entry.at)} - {entry.user}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <Sheet
        open={statusOpen}
        onOpenChange={setStatusOpen}
        title="Change bill status"
        description={`Currently ${order.status}. Cancelling only marks the bill - it keeps its parts, its payments and its history, and nothing goes back to stock.`}
      >
        <div className="space-y-2 pb-2">
          {COUNTER_STATUSES.map((status) => {
            const isCurrent = status === order.status;
            return (
              <button
                key={status}
                type="button"
                disabled={isCurrent || changeStatus.isPending}
                onClick={() => void pickStatus(status)}
                className={cn(
                  'flex min-h-[56px] w-full items-center justify-between gap-2 rounded-xl border-2 px-4 text-left text-base font-semibold transition-colors',
                  isCurrent
                    ? 'cursor-default border-primary bg-primary/5 text-primary'
                    : 'border-border hover:bg-secondary',
                  status === 'Delivered' && 'border-success bg-success/5 text-success',
                  status === 'Cancelled' && 'border-destructive bg-destructive/5 text-destructive',
                )}
              >
                {status}
                {isCurrent ? <CheckCircle2 className="h-5 w-5" /> : null}
              </button>
            );
          })}
        </div>
      </Sheet>

      <PaymentSheet
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        balance={order.balance}
        busy={recordPayment.isPending}
        onSubmit={async (body) => {
          const response = await recordPayment.mutateAsync(body);
          if (response.warning) toast.warning(response.warning.message);
          else toast.success('Payment recorded', money(body.amount));
          setPaymentOpen(false);
        }}
      />

      <DeliverSheet
        open={deliverOpen}
        onOpenChange={setDeliverOpen}
        customerName={order.customerName}
        balance={order.balance}
        onSubmit={async (deliveredTo) => {
          if (order.balance > 0) {
            toast.error('Payment still due', `Collect ${money(order.balance)} before giving the device.`);
            return;
          }
          const response = await deliver.mutateAsync(deliveredTo);
          if (response.warning) toast.warning(response.warning.message);
          else toast.success('Device handed over', 'Bill is ready to print.');
          setDeliverOpen(false);
          navigate('/orders?scope=delivered');
        }}
        extraPayment={
          order.balance > 0 ? (
            <Button
              variant="destructive"
              className="w-full gap-2"
              onClick={() => {
                setDeliverOpen(false);
                setPaymentOpen(true);
              }}
            >
              <Wallet className="h-5 w-5" /> Pay {money(order.balance)} first
            </Button>
          ) : null
        }
      />

      <BillItemPicker
        open={partOpen}
        onOpenChange={setPartOpen}
        excludeIds={order.parts.map((line) => line.partId)}
        onPick={(part) => {
          void addPart
            .mutateAsync({ partId: part.id, quantity: 1, unitPrice: part.sellingPrice })
            .then((response) => {
              if (response.warning) toast.warning(response.warning.message);
              else toast.success(`${part.name} added to the bill`);
            })
            .catch((caught: unknown) =>
              toast.error('Could not add the item', caught instanceof Error ? caught.message : undefined),
            );
        }}
      />

      <EditOrderSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        order={order}
        saving={update.isPending}
        onSave={async (body) => {
          const response = await update.mutateAsync(body);
          if (response.warning) toast.warning(response.warning.message);
          else toast.success('Bill updated');
          setEditOpen(false);
        }}
      />
    </div>
  );
}

function MoneyCell({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'destructive';
}): JSX.Element {
  return (
    <div
      className={cn(
        'rounded-xl p-3',
        tone === 'success' && 'bg-success/10',
        tone === 'destructive' && 'bg-destructive/10',
        tone === 'default' && 'bg-secondary',
      )}
    >
      <p className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'tabular mt-0.5 text-lg font-black leading-tight',
          tone === 'success' && 'text-success',
          tone === 'destructive' && 'text-destructive',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function PaymentRow({
  payment,
  onDelete,
}: {
  payment: { id: string; amount: number; mode: string; date: string; user: string; note: string };
  onDelete?: () => void;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-border p-3">
      <div className="min-w-0">
        <p className="tabular text-base font-black text-success">{money(payment.amount)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {payment.mode} - {dateTime(payment.date)} - {payment.user}
        </p>
        {payment.note ? <p className="truncate text-xs text-muted-foreground">{payment.note}</p> : null}
      </div>
      {onDelete ? (
        <Button variant="ghost" size="icon" aria-label="Remove payment" onClick={onDelete} className="shrink-0 text-destructive">
          <Trash2 className="h-5 w-5" />
        </Button>
      ) : null}
    </div>
  );
}

/** Saves / prints the bill, and pushes it to Drive when connected. */
function BillActions({ orderId, hasDrive }: { orderId: string; hasDrive: boolean }): JSX.Element {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="outline"
      className="w-full justify-start gap-2"
      loading={busy}
      loadingText="Saving to Google Drive..."
      onClick={() => {
        setBusy(true);
        void api
          .post<{ saved: boolean; driveFileId?: string; message?: string }>(
            `/orders/${orderId}/bill/save`,
          )
          .then((response) => {
            if (response.data.saved) toast.success('Bill saved to Google Drive');
            else
              toast.warning(
                'Bill not saved to Drive',
                response.data.message ?? 'Connect Google Sheets first.',
              );
          })
          .catch((caught: unknown) =>
            toast.error('Could not save the bill', caught instanceof Error ? caught.message : undefined),
          )
          .finally(() => setBusy(false));
      }}
    >
      <CloudUpload className="h-5 w-5" />
      {hasDrive ? 'Update Bill in Google Drive' : 'Save Bill to Google Drive'}
    </Button>
  );
}

function PaymentSheet({
  open,
  onOpenChange,
  balance,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balance: number;
  busy: boolean;
  onSubmit: (body: { amount: number; mode: string; note: string; idempotencyKey: string }) => Promise<void>;
}): JSX.Element {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('Cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const value = Number(amount) || 0;

  const submit = async (): Promise<void> => {
    if (value <= 0) {
      toast.error('Enter the amount received');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ amount: round2(value), mode, note: note.trim(), idempotencyKey });
      setAmount('');
      setNote('');
      setIdempotencyKey(crypto.randomUUID());
    } catch (caught) {
      toast.error('Could not save the payment', caught instanceof Error ? caught.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Take payment"
      description={balance > 0 ? `${money(balance)} is still due` : 'Advance or extra payment'}
    >
      <div className="space-y-3 pb-2">
        <Field label="Amount Received" htmlFor="payment-amount">
          <Input
            id="payment-amount"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0"
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

        <Field label="Paid By" htmlFor="payment-mode">
          <Select
            value={mode}
            onValueChange={setMode}
            options={PAYMENT_MODES.map((item) => ({ value: item, label: item }))}
          />
        </Field>

        <Field label="Note" htmlFor="payment-note" optional>
          <Input
            id="payment-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Advance at counter"
          />
        </Field>

        <Button size="lg" className="w-full" loading={busy || saving} onClick={() => void submit()}>
          Save Payment
        </Button>
      </div>
    </Sheet>
  );
}

function DeliverSheet({
  open,
  onOpenChange,
  customerName,
  balance,
  onSubmit,
  extraPayment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  balance: number;
  onSubmit: (deliveredTo: string) => Promise<void>;
  extraPayment?: React.ReactNode;
}): JSX.Element {
  const [deliveredTo, setDeliveredTo] = useState(customerName);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Give device back to customer"
      description="Mark the bill as handed over."
    >
      <div className="space-y-3 pb-2">
        <Field label="Handed over to" htmlFor="delivered-to" hint="Usually the same person who brought it.">
          <Input
            id="delivered-to"
            value={deliveredTo}
            onChange={(event) => setDeliveredTo(event.target.value)}
            className="h-14"
          />
        </Field>

        {balance > 0 ? (
          <InlineNotice tone="error">
            {money(balance)} is still due. The server will not allow delivery until the payment is
            recorded.
          </InlineNotice>
        ) : (
          <InlineNotice tone="success">All money received. Device can be handed over.</InlineNotice>
        )}

        {extraPayment}

        <Button
          size="lg"
          variant="success"
          className="w-full gap-2"
          disabled={balance > 0}
          loading={busy}
          onClick={() => {
            setBusy(true);
            void onSubmit(deliveredTo.trim())
              .catch((caught: unknown) =>
                toast.error('Could not complete delivery', caught instanceof Error ? caught.message : undefined),
              )
              .finally(() => setBusy(false));
          }}
        >
          <Truck className="h-5 w-5" /> Confirm Delivery
        </Button>
      </div>
    </Sheet>
  );
}

function EditOrderSheet({
  open,
  onOpenChange,
  order,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    customerName: string;
    mobile: string;
    deviceType: string;
    brand: string;
    model: string;
    complaint: string;
    imei: string;
    deviceCondition: string;
    accessories: string;
    expectedDelivery: string;
    technician: string;
    notes: string;
    estimatedAmount: number;
    finalAmount: number;
    discount: number;
  };
  saving: boolean;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}): JSX.Element {
  const [form, setForm] = useState(order);
  const [editingMoney, setEditingMoney] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Edit bill"
      description="Money already paid is not changed here."
    >
      <div className="space-y-3 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer" htmlFor="edit-name">
            <Input id="edit-name" value={form.customerName} onChange={(event) => set('customerName', event.target.value)} />
          </Field>
          <Field label="Mobile" htmlFor="edit-mobile">
            <Input
              id="edit-mobile"
              {...numberPad}
              value={form.mobile}
              onChange={(event) => set('mobile', event.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Device Type" htmlFor="edit-type">
            <Select
              value={form.deviceType}
              onValueChange={(value) => set('deviceType', value)}
              options={DEVICE_TYPES.map((item) => ({ value: item, label: item }))}
            />
          </Field>
          <Field label="Condition" htmlFor="edit-condition">
            <Select
              value={form.deviceCondition}
              onValueChange={(value) => set('deviceCondition', value)}
              options={DEVICE_CONDITIONS.map((item) => ({ value: item, label: item }))}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand" htmlFor="edit-brand">
            <BrandField
              id="edit-brand"
              value={form.brand}
              onChange={(next) => set('brand', next)}
            />
          </Field>
          <Field label="Model" htmlFor="edit-model">
            <ModelField
              id="edit-model"
              value={form.model}
              onChange={(next) => set('model', next)}
              brand={form.brand}
            />
          </Field>
        </div>

        <Field label="Problem" htmlFor="edit-complaint">
          <ProblemField
            id="edit-complaint"
            value={form.complaint}
            onChange={(next) => set('complaint', next)}
            placeholder="Display change, mic problem..."
          />
        </Field>

        <Field label="Accessories" htmlFor="edit-accessories" optional>
          <Textarea
            id="edit-accessories"
            value={form.accessories}
            onChange={(event) => set('accessories', event.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Expected Delivery" htmlFor="edit-expected" optional>
            <Input
              id="edit-expected"
              type="date"
              value={form.expectedDelivery ?? ''}
              onChange={(event) => set('expectedDelivery', event.target.value)}
            />
          </Field>
          <Field label="Technician" htmlFor="edit-technician" optional>
            <Input
              id="edit-technician"
              value={form.technician}
              onChange={(event) => set('technician', event.target.value)}
            />
          </Field>
        </div>

        <Field label="Notes" htmlFor="edit-notes" optional>
          <Textarea id="edit-notes" value={form.notes} onChange={(event) => set('notes', event.target.value)} />
        </Field>

        <button
          type="button"
          onClick={() => setEditingMoney((current) => !current)}
          className="flex w-full items-center justify-between rounded-xl border-2 border-border px-4 py-3 text-sm font-bold"
        >
          Money
          <span className="text-muted-foreground">{editingMoney ? 'Hide' : 'Edit'}</span>
        </button>

        {editingMoney ? (
          <div className="space-y-3 rounded-xl bg-secondary p-3">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Estimate" htmlFor="edit-estimate">
                <Input
                  id="edit-estimate"
                  type="number"
                  inputMode="decimal"
                  value={form.estimatedAmount}
                  onChange={(event) => set('estimatedAmount', Number(event.target.value) || 0)}
                />
              </Field>
              <Field label="Final" htmlFor="edit-final">
                <Input
                  id="edit-final"
                  type="number"
                  inputMode="decimal"
                  value={form.finalAmount}
                  onChange={(event) => set('finalAmount', Number(event.target.value) || 0)}
                />
              </Field>
              <Field label="Discount" htmlFor="edit-discount">
                <Input
                  id="edit-discount"
                  type="number"
                  inputMode="decimal"
                  value={form.discount}
                  onChange={(event) => set('discount', Number(event.target.value) || 0)}
                />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              Changing the final amount never changes money already paid. The balance updates by
              itself.
            </p>
          </div>
        ) : null}

        <Button
          size="lg"
          className="w-full"
          loading={saving}
          onClick={() =>
            void onSave({
              customerName: form.customerName,
              mobile: form.mobile,
              deviceType: form.deviceType,
              brand: form.brand,
              model: form.model,
              complaint: form.complaint,
              imei: form.imei,
              deviceCondition: form.deviceCondition,
              accessories: form.accessories,
              expectedDelivery: form.expectedDelivery,
              technician: form.technician,
              notes: form.notes,
              estimatedAmount: form.estimatedAmount,
              finalAmount: form.finalAmount,
              discount: form.discount,
            })
          }
        >
          Save Changes
        </Button>
      </div>
    </Sheet>
  );
}

/**
 * Picks what to charge for. It deliberately shows only the name and the price
 * - how many are on the shelf is stock information and does not belong on a
 * billing screen.
 */
function BillItemPicker({
  open,
  onOpenChange,
  onPick,
  excludeIds = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (part: PartListItem) => void;
  excludeIds?: string[];
}): JSX.Element {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 200);
  const { data, isLoading } = useParts(debounced, false);

  const items = (data ?? []).filter((part) => !excludeIds.includes(part.id));

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add to this bill" description="Name and price only.">
      <div className="space-y-3 pb-2">
        <Input
          id="bill-item-search"
          name="bill-item-search"
          aria-label="Search item name"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search item name"
          autoFocus
        />
        {isLoading && !data ? (
          <LoadingBlock label="Loading items..." />
        ) : items.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {search ? 'Nothing matches that search.' : 'No items on the price list yet.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((part) => (
              <li key={part.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(part);
                    onOpenChange(false);
                    setSearch('');
                  }}
                  className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border-2 border-border px-3 text-left"
                >
                  <span className="min-w-0 truncate font-bold">{part.name}</span>
                  <span className="tabular shrink-0 font-black">{money(part.sellingPrice)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
