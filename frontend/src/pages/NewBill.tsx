import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Save,
  Smartphone,
  User,
} from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea, numberPad } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ProblemField } from '@/components/problem-field';
import { BrandField, ModelField } from '@/components/device-fields';
import { InlineNotice } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import {
  useCreateOrder,
  useCustomers,
  useNextOrderId,
} from '@/hooks/use-queries';
import { DEVICE_CONDITIONS, DEVICE_TYPES, PAYMENT_MODES } from '@shared/domain';
import { dateOnly, isValidMobile, mobileOnly, money, plusDaysIso } from '@/lib/format';
import { cn } from '@/lib/utils';
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

/** The four taps that cover almost every bill, plus a custom date. */
const DATE_CHIPS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: '2 Days', days: 2 },
  { label: '3 Days', days: 3 },
] as const;

/**
 * New Bill. Four steps on one screen: customer, device and problem, amount,
 * save. Anything rarely needed sits behind "More details" so the common case
 * stays short. Stock is never shown here - that lives in JMR - STOCK.
 */
export default function NewBill(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const createOrder = useCreateOrder();
  const { data: nextId } = useNextOrderId();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const errors = {
    customerName: form.customerName.trim() ? '' : 'Customer name is required',
    mobile: isValidMobile(form.mobile) ? '' : 'Enter a valid 10 digit mobile number',
    brand: form.brand.trim() ? '' : 'Device name is required',
    complaint: form.complaint.trim() ? '' : 'Please write the problem',
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const estimated = Number(form.estimatedAmount) || 0;
  const discount = Number(form.discount) || 0;
  const advance = Number(form.advance) || 0;
  const payable = Math.max(0, Math.round((estimated - discount) * 100) / 100);
  const balanceAfterAdvance = Math.max(0, Math.round((payable - advance) * 100) / 100);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  // A returning customer only has to type the mobile number.
  const { data: matches } = useCustomers(form.mobile);
  const existing = useMemo(
    () => (form.mobile.length === 10 ? matches?.find((c) => c.mobile === form.mobile) : undefined),
    [matches, form.mobile],
  );

  useEffect(() => {
    if (existing && !form.customerName.trim()) {
      setForm((current) => ({ ...current, customerName: existing.name }));
    }
  }, [existing, form.customerName]);

  const chosenDate = form.expectedDelivery;

  const save = async (): Promise<void> => {
    setTouched(true);
    if (hasErrors) {
      toast.error('Please fix the highlighted fields', 'Name, mobile, device and problem are required.');
      return;
    }
    if (advance > payable && payable > 0) {
      toast.error('Advance is more than the bill amount', `Total is ${money(payable)}.`);
      return;
    }

    try {
      const response = await createOrder.mutateAsync({
        customerName: form.customerName.trim(),
        mobile: mobileOnly(form.mobile),
        deviceType: form.deviceType,
        brand: form.brand.trim(),
        model: form.model.trim(),
        complaint: form.complaint.trim(),
        imei: form.imei.trim(),
        deviceCondition: form.deviceCondition,
        accessories: form.accessories.trim(),
        expectedDelivery: chosenDate,
        technician: form.technician,
        notes: form.notes.trim(),
        estimatedAmount: estimated,
        discount,
        advance,
        advanceMode: form.advanceMode,
        parts: [],
      });
      if (response.warning) toast.warning(response.warning.message);
      else toast.success('Bill saved', `${response.data.id} is ready.`);
      void directSaveBillToSupabase(response.data);
      navigate(`/orders/${response.data.id}`);
    } catch (error) {
      toast.error('Could not save the bill', error instanceof Error ? error.message : undefined);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <PageHeader
        title="New Bill"
        subtitle="Customer, device, amount, save"
        back
        action={
          nextId ? (
            <div className="rounded-lg bg-secondary px-2.5 py-1.5 text-right">
              <p className="text-2xs font-bold uppercase text-muted-foreground">Bill No.</p>
              <p className="tabular text-sm font-black text-primary">{nextId.orderId}</p>
            </div>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          {/* 1. Customer */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" /> 1. Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field
                label="Customer Name"
                htmlFor="customerName"
                error={touched ? errors.customerName || null : null}
              >
                <Input
                  id="customerName"
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
                hint="A returning customer's saved details fill in once the number matches."
              >
                <Input
                  id="mobile"
                  {...numberPad}
                  autoComplete="tel"
                  value={form.mobile}
                  onChange={(event) => set('mobile', mobileOnly(event.target.value).slice(0, 10))}
                  placeholder="10 digit number"
                  invalid={touched && Boolean(errors.mobile)}
                  className="h-14 text-lg"
                />
              </Field>

              {existing ? (
                <button
                  type="button"
                  onClick={() => set('customerName', existing.name)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border-2 border-success bg-success/5 p-3 text-left"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-success">Returning customer</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {existing.name} · {existing.orderCount} past bills
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-success" />
                </button>
              ) : null}
            </CardContent>
          </Card>

          {/* 2. Device and problem */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-primary" /> 2. Device &amp; Problem
              </CardTitle>
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
                <Field
                  label="Device / Brand"
                  htmlFor="brand"
                  error={touched ? errors.brand || null : null}
                >
                  <BrandField
                    id="brand"
                    value={form.brand}
                    onChange={(next) => set('brand', next)}
                    placeholder="Samsung"
                    invalid={touched && Boolean(errors.brand)}
                  />
                </Field>
              </div>

              <Field label="Model" htmlFor="model" optional>
                <ModelField
                  id="model"
                  value={form.model}
                  onChange={(next) => set('model', next)}
                  brand={form.brand}
                  placeholder="Galaxy M30"
                />
              </Field>

              <Field
                label="Problem"
                htmlFor="complaint"
                error={touched ? errors.complaint || null : null}
                hint="Tap the usual fault, or type exactly what the customer said."
              >
                <ProblemField
                  id="complaint"
                  value={form.complaint}
                  onChange={(next) => set('complaint', next)}
                  placeholder="Display change, mic problem..."
                  invalid={touched && Boolean(errors.complaint)}
                />
              </Field>

              {/* Expected date: four taps cover nearly every bill. */}
              <Field label="Ready By" htmlFor="expectedDelivery" optional>
                <div className="grid grid-cols-4 gap-2">
                  {DATE_CHIPS.map((chip) => {
                    const value = plusDaysIso(chip.days);
                    const active = chosenDate === value;
                    return (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => set('expectedDelivery', active ? '' : value)}
                        className={cn(
                          'min-h-[48px] rounded-xl border-2 text-sm font-bold transition-colors',
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-card',
                        )}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
                <Input
                  id="expectedDelivery"
                  type="date"
                  min={plusDaysIso(0)}
                  value={chosenDate}
                  onChange={(event) => set('expectedDelivery', event.target.value)}
                  className="mt-2"
                />
                {chosenDate ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Promised for {dateOnly(`${chosenDate}T00:00:00.000Z`)}
                  </p>
                ) : null}
              </Field>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {/* 3. Amount */}
          <Card>
            <CardHeader>
              <CardTitle>3. Amount</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Bill Amount" htmlFor="estimatedAmount" optional>
                <Input
                  id="estimatedAmount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={form.estimatedAmount}
                  onChange={(event) => set('estimatedAmount', event.target.value)}
                  placeholder="0"
                  className="h-16 text-3xl font-black"
                />
                <p className="text-sm text-muted-foreground">
                  Not sure the price yet? Leave this empty. The bill opens at 0 and you set
                  the amount later from the bill.
                </p>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Discount" htmlFor="discount" optional>
                  <Input
                    id="discount"
                    type="number"
                    inputMode="decimal"
                    value={form.discount}
                    onChange={(event) => set('discount', event.target.value)}
                    placeholder="0"
                    className="h-12"
                  />
                </Field>
                <Field label="Advance Now" htmlFor="advance" optional>
                  <Input
                    id="advance"
                    type="number"
                    inputMode="decimal"
                    value={form.advance}
                    onChange={(event) => set('advance', event.target.value)}
                    placeholder="0"
                    invalid={advance > payable && payable > 0}
                    className="h-12"
                  />
                </Field>
              </div>

              <Field label="Advance Paid By" htmlFor="advanceMode" optional>
                <Select
                  value={form.advanceMode}
                  onValueChange={(value) => set('advanceMode', value)}
                  options={PAYMENT_MODES.map((mode) => ({ value: mode, label: mode }))}
                />
              </Field>

              {advance > payable && payable > 0 ? (
                <InlineNotice tone="error">
                  Advance cannot be more than the bill amount ({money(payable)}).
                </InlineNotice>
              ) : null}

              <div className="rounded-xl bg-secondary p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Bill total</span>
                  <span className="tabular font-semibold">{money(payable)}</span>
                </div>
                <div className="mt-1 flex justify-between text-base font-black">
                  <span>Balance on delivery</span>
                  <span className="tabular">{money(balanceAfterAdvance)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Rarely needed fields, kept out of the way. */}
          <Card>
            <button
              type="button"
              onClick={() => setMoreOpen((value) => !value)}
              className="flex w-full items-center justify-between gap-2 p-4 text-left"
            >
              <span className="text-base font-bold">More details</span>
              <ChevronDown
                className={cn('h-5 w-5 text-muted-foreground transition-transform', moreOpen && 'rotate-180')}
              />
            </button>
            {moreOpen ? (
              <CardContent className="space-y-3 pt-0">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Condition" htmlFor="deviceCondition">
                    <Select
                      value={form.deviceCondition}
                      onValueChange={(value) => set('deviceCondition', value)}
                      options={DEVICE_CONDITIONS.map((c) => ({ value: c, label: c }))}
                    />
                  </Field>
                  <Field label="IMEI / Serial" htmlFor="imei" optional>
                    <Input
                      id="imei"
                      value={form.imei}
                      onChange={(event) => set('imei', event.target.value)}
                      placeholder="15 digits"
                      className="tabular"
                    />
                  </Field>
                </div>
                <Field label="Accessories Received" htmlFor="accessories" optional>
                  <Input
                    id="accessories"
                    value={form.accessories}
                    onChange={(event) => set('accessories', event.target.value)}
                    placeholder="Charger, back cover"
                  />
                </Field>
                <Field label="Technician" htmlFor="technician" optional>
                  <Input
                    id="technician"
                    value={form.technician}
                    onChange={(event) => set('technician', event.target.value)}
                    placeholder="Who is working on it"
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
            ) : null}
          </Card>

          {/* 4. Save */}
          <div className="lg:sticky lg:bottom-4">
            <Button
              size="xl"
              className="w-full gap-2 shadow-lg"
              loading={createOrder.isPending}
              loadingText="Saving bill..."
              onClick={() => void save()}
            >
              <Save className="h-5 w-5" /> Save Bill
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
