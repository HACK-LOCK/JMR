import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Package, Save, User } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { InlineNotice } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { PartLineEditor, PartPicker, type PickedPart } from '@/components/part-picker';
import {
  useCreateOrder,
  useCustomers,
  useNextOrderId,
  useSettings,
} from '@/hooks/use-queries';
import { DEVICE_CONDITIONS, DEVICE_TYPES, PAYMENT_MODES } from '@shared/domain';
import { isValidMobile, mobileOnly, money, plusDaysIso } from '@/lib/format';
import { round2 } from '@shared/domain';
import { downloadProtectedFile } from '@/lib/api';
import { directSaveBillToSupabase } from '@/lib/supabase';

interface FormState {
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
  estimatedAmount: string;
  discount: string;
  advance: string;
  advanceMode: string;
}

const EMPTY: FormState = {
  customerName: '',
  mobile: '',
  deviceType: 'Mobile',
  brand: '',
  model: '',
  complaint: '',
  imei: '',
  deviceCondition: 'Good',
  accessories: '',
  expectedDelivery: '',
  technician: '',
  notes: '',
  estimatedAmount: '',
  discount: '',
  advance: '',
  advanceMode: 'Cash',
};

export default function NewRepair(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const createOrder = useCreateOrder();
  const { data: nextId } = useNextOrderId();
  const { data: settings } = useSettings();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [parts, setParts] = useState<PickedPart[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const complaintRef = useRef<HTMLTextAreaElement>(null);

  // Anyone who handles repairs is a valid technician - offer the shop's numbers.
  const technicianOptions = useMemo(
    () => [
      { value: '', label: 'Not decided yet' },
      { value: 'Ashok Bhai', label: 'Ashok Bhai' },
      { value: 'Mitesh Bhai', label: 'Mitesh Bhai' },
    ],
    [],
  );

  const errors = {
    customerName: form.customerName.trim() ? '' : 'Customer name is required',
    mobile: isValidMobile(form.mobile) ? '' : 'Enter a valid 10 digit mobile number',
    brand: form.brand.trim() ? '' : 'Brand is required',
    complaint: form.complaint.trim() ? '' : 'Please write the problem',
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const partsTotal = round2(parts.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
  const estimated = Number(form.estimatedAmount) || 0;
  const discount = Number(form.discount) || 0;
  const advance = Number(form.advance) || 0;
  const payable = round2(Math.max(0, estimated - discount));
  const balanceAfterAdvance = round2(Math.max(0, payable - advance));

  useEffect(() => {
    if (estimated === 0 && partsTotal > 0) {
      setForm((current) => ({ ...current, estimatedAmount: String(partsTotal) }));
    }
  }, [partsTotal, estimated]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const addPart = (part: {
    id: string;
    name: string;
    quantity: number;
    sellingPrice: number;
    consumeMode: string;
  }): void => {
    setParts((current) => {
      const existing = current.find((line) => line.partId === part.id);
      if (existing) {
        if (existing.quantity + 1 > part.quantity) {
          toast.warning('Not enough stock', `Only ${part.quantity} of ${part.name} available.`);
          return current;
        }
        return current.map((line) =>
          line.partId === part.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...current,
        {
          partId: part.id,
          name: part.name,
          quantity: 1,
          unitPrice: part.sellingPrice,
          available: part.quantity,
          consumeMode: part.consumeMode,
        },
      ];
    });
  };

  const save = async (): Promise<void> => {
    setTouched(true);
    if (hasErrors) {
      toast.error('Please fix the highlighted fields', 'Name, mobile, brand and problem are required.');
      return;
    }
    if (advance > payable && payable > 0) {
      toast.error('Advance is more than the estimate', `Payable is ${money(payable)}.`);
      return;
    }

    const payload: Record<string, unknown> = {
      customerName: form.customerName.trim(),
      mobile: mobileOnly(form.mobile),
      deviceType: form.deviceType,
      brand: form.brand.trim(),
      model: form.model.trim(),
      complaint: form.complaint.trim(),
      imei: form.imei.trim(),
      deviceCondition: form.deviceCondition,
      accessories: form.accessories.trim(),
      expectedDelivery: form.expectedDelivery,
      technician: form.technician,
      notes: form.notes.trim(),
      estimatedAmount: estimated,
      discount,
      advance,
      advanceMode: form.advanceMode,
      parts: parts.map((line) => ({
        partId: line.partId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
    };

    try {
      const response = await createOrder.mutateAsync(payload);
      if (response.warning) toast.warning(response.warning.message);
      else toast.success('Repair saved', `${response.data.id} is ready.`);
      void directSaveBillToSupabase(response.data);
      // Automatically download the bill PDF when save is clicked
      void downloadProtectedFile(`/orders/${response.data.id}/bill.pdf`, `${response.data.id}.pdf`).catch(
        (dlErr) => {
          console.warn('[download] Auto download bill PDF notice:', dlErr);
        },
      );
      // New repair details open in edit mode: staff often mistype the complaint.
      navigate(`/orders/${response.data.id}?new=1`);
    } catch (error) {
      toast.error('Could not save the repair', error instanceof Error ? error.message : undefined);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <PageHeader
        title="New Repair"
        subtitle="Take in a device in under a minute"
        back
        action={
          nextId ? (
            <div className="rounded-lg bg-secondary px-2.5 py-1.5 text-right">
              <p className="text-2xs font-bold uppercase text-muted-foreground">Order ID</p>
              <p className="tabular text-sm font-black text-primary">{nextId.orderId}</p>
            </div>
          ) : null
        }
      />

      {settings?.serviceDescription ? (
        <InlineNotice tone="info">{settings.serviceDescription}</InlineNotice>
      ) : null}

      {/* Customer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> Customer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CustomerLookup
            mobile={form.mobile}
            onPick={(customer) => {
              set('customerName', customer.name);
              set('mobile', customer.mobile);
              toast.success('Customer filled in', `${customer.name} - ${customer.orderCount} past repairs`);
            }}
          />
          <Field
            label="Customer Name"
            htmlFor="customerName"
            error={touched ? errors.customerName || null : null}
          >
            <Input
              id="customerName"
              ref={nameRef}
              value={form.customerName}
              onChange={(event) => set('customerName', event.target.value)}
              placeholder="Full name"
              invalid={touched && Boolean(errors.customerName)}
              className="h-14 text-lg"
            />
          </Field>
          <Field
            label="Mobile Number"
            htmlFor="mobile"
            error={touched ? errors.mobile || null : null}
            hint="Used again automatically next time this customer comes."
          >
            <Input
              id="mobile"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={form.mobile}
              onChange={(event) => set('mobile', mobileOnly(event.target.value).slice(0, 10))}
              placeholder="10 digit number"
              invalid={touched && Boolean(errors.mobile)}
              className="h-14 text-lg"
            />
          </Field>
        </CardContent>
      </Card>

      {/* Device */}
      <Card>
        <CardHeader>
          <CardTitle>Device & Problem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Device Type" htmlFor="deviceType">
              <Select
                value={form.deviceType}
                onValueChange={(value) => set('deviceType', value)}
                options={DEVICE_TYPES.map((type) => ({ value: type, label: type }))}
              />
            </Field>
            <Field label="Condition" htmlFor="deviceCondition">
              <Select
                value={form.deviceCondition}
                onValueChange={(value) => set('deviceCondition', value)}
                options={DEVICE_CONDITIONS.map((condition) => ({ value: condition, label: condition }))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand" htmlFor="brand" error={touched ? errors.brand || null : null}>
              <Input
                id="brand"
                value={form.brand}
                onChange={(event) => set('brand', event.target.value)}
                placeholder="Samsung"
                invalid={touched && Boolean(errors.brand)}
                className="h-14 text-lg"
              />
            </Field>
            <Field label="Model" htmlFor="model" optional>
              <Input
                id="model"
                value={form.model}
                onChange={(event) => set('model', event.target.value)}
                placeholder="Galaxy M30"
                className="h-14 text-lg"
              />
            </Field>
          </div>

          <Field
            label="Problem / Complaint"
            htmlFor="complaint"
            error={touched ? errors.complaint || null : null}
            hint="Write exactly what the customer said."
          >
            <Textarea
              id="complaint"
              ref={complaintRef}
              value={form.complaint}
              onChange={(event) => set('complaint', event.target.value)}
              placeholder="Screen broken, touch not working"
              invalid={touched && Boolean(errors.complaint)}
              className="min-h-[92px] text-lg"
            />
          </Field>

          <Field label="IMEI / Serial" htmlFor="imei" optional>
            <Input
              id="imei"
              value={form.imei}
              onChange={(event) => set('imei', event.target.value)}
              placeholder="15 digits"
              className="h-12 tabular"
            />
          </Field>

          <Field label="Accessories Received" htmlFor="accessories" optional hint="Charger, case, SIM card...">
            <Textarea
              id="accessories"
              value={form.accessories}
              onChange={(event) => set('accessories', event.target.value)}
              placeholder="Charger, back cover"
              className="min-h-[64px]"
            />
          </Field>
        </CardContent>
      </Card>

      {/* Timing */}
      <Card>
        <CardHeader>
          <CardTitle>Timing & Staff</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Expected Delivery" htmlFor="expectedDelivery" optional>
            <div className="grid grid-cols-2 gap-2">
              <Input
                id="expectedDelivery"
                type="date"
                value={form.expectedDelivery}
                min={plusDaysIso(0)}
                onChange={(event) => set('expectedDelivery', event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => set('expectedDelivery', plusDaysIso(2))}
                className="h-12"
              >
                In 2 days
              </Button>
            </div>
          </Field>
          <Field label="Technician" htmlFor="technician" optional>
            <Select
              value={form.technician}
              onValueChange={(value) => set('technician', value)}
              options={technicianOptions}
              allowEmpty
              emptyLabel="Not decided yet"
            />
          </Field>
          <Field label="Notes" htmlFor="notes" optional>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(event) => set('notes', event.target.value)}
              placeholder="Customer will call after 6 pm"
              className="min-h-[64px]"
            />
          </Field>
        </CardContent>
      </Card>

      {/* Parts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" /> Parts Needed
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)} className="gap-1.5">
              Add part
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {parts.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              No parts added. Stock is only reduced when you tap
              <span className="font-bold"> Part Used </span>
              on the repair screen.
            </p>
          ) : (
            parts.map((line) => (
              <PartLineEditor
                key={line.partId}
                line={line}
                onChange={(next) =>
                  setParts((current) => current.map((item) => (item.partId === next.partId ? next : item)))
                }
                onRemove={() => setParts((current) => current.filter((item) => item.partId !== line.partId))}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Money */}
      <Card>
        <CardHeader>
          <CardTitle>Estimate & Advance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estimated Amount" htmlFor="estimatedAmount">
              <Input
                id="estimatedAmount"
                type="number"
                inputMode="decimal"
                value={form.estimatedAmount}
                onChange={(event) => set('estimatedAmount', event.target.value)}
                placeholder="0"
                className="h-14 text-lg"
              />
            </Field>
            <Field label="Discount" htmlFor="discount" optional>
              <Input
                id="discount"
                type="number"
                inputMode="decimal"
                value={form.discount}
                onChange={(event) => set('discount', event.target.value)}
                placeholder="0"
                className="h-14 text-lg"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Advance Taken Now" htmlFor="advance" optional>
              <Input
                id="advance"
                type="number"
                inputMode="decimal"
                value={form.advance}
                onChange={(event) => set('advance', event.target.value)}
                placeholder="0"
                invalid={advance > payable && payable > 0}
                className="h-14 text-lg"
              />
            </Field>
            <Field label="Paid By" htmlFor="advanceMode" optional>
              <Select
                value={form.advanceMode}
                onValueChange={(value) => set('advanceMode', value)}
                options={PAYMENT_MODES.map((mode) => ({ value: mode, label: mode }))}
                allowEmpty
                emptyLabel="Not specified"
              />
            </Field>
          </div>

          {advance > payable && payable > 0 ? (
            <InlineNotice tone="error">
              Advance cannot be more than the payable amount ({money(payable)}).
            </InlineNotice>
          ) : null}

          <div className="rounded-xl bg-secondary p-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Parts total</span>
              <span className="tabular font-semibold">{money(partsTotal)}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-muted-foreground">Payable now</span>
              <span className="tabular font-semibold">{money(payable)}</span>
            </div>
            <div className="mt-1 flex justify-between text-base font-black">
              <span>Balance on delivery</span>
              <span className="tabular">{money(balanceAfterAdvance)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-[72px] z-20 space-y-2 md:bottom-4">
        <Button
          size="xl"
          className="w-full gap-2 shadow-lg"
          loading={createOrder.isPending}
          loadingText="Saving repair..."
          onClick={() => void save()}
        >
          <Save className="h-5 w-5" /> Save Repair
        </Button>
      </div>

      <PartPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={addPart}
        excludeIds={parts.map((line) => line.partId)}
      />
    </div>
  );
}

/**
 * Finds an existing customer by mobile so repeat visits take two seconds
 * instead of two minutes.
 */
function CustomerLookup({
  mobile,
  onPick,
}: {
  mobile: string;
  onPick: (customer: { name: string; mobile: string; orderCount: number }) => void;
}): JSX.Element | null {
  const { data } = useCustomers(mobile);
  const match = data?.find((customer) => customer.mobile === mobile);

  if (mobile.length !== 10 || !match) return null;

  return (
    <button
      type="button"
      onClick={() => onPick(match)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border-2 border-success bg-success/5 p-3 text-left"
    >
      <div className="flex min-w-0 items-center gap-2">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-success">Returning customer</p>
          <p className="truncate text-xs text-muted-foreground">
            {match.name} - {match.orderCount} past repairs
          </p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-success" />
    </button>
  );
}

/** Shared helper so the balance chips look the same everywhere. */
export function BalancePill({ amount, className }: { amount: number; className?: string }): JSX.Element {
  const tone = amount <= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive';
  return (
    <span className={cn('tabular rounded-lg px-2 py-1 text-xs font-bold', tone, className)}>
      {amount <= 0 ? <CheckCircle2 className="inline h-3.5 w-3.5" /> : null}
      {amount <= 0 ? ' Paid' : ` ${money(amount)} due`}
    </span>
  );
}
