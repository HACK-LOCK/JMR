import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Boxes,
  Building2,
  FileSpreadsheet,
  History,
  Lock,
  Package,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plus,
  Search as SearchIcon,
  Settings as SettingsIcon,
  Trash2,
  Wallet,
} from 'lucide-react';
import { MiniStat, PageHeader, SectionCard } from '@/components/app-shell';
import { PartPicker } from '@/components/part-picker';
import { StockGate } from '@/components/stock-gate';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorBlock, InlineNotice, LoadingBlock } from '@/components/ui/feedback';
import { Input, Textarea, numberPad } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import {
  useCreatePart,
  useCreateSupplier,
  useDeletePart,
  useDeleteSupplier,
  useParts,
  useStockIn,
  useStockOut,
  useStockReturn,
  useStockSummary,
  useSuppliers,
  useUpdatePart,
  useUpdateSupplier,
} from '@/hooks/use-queries';
import { useDebounced } from '@/lib/hooks';
import { isValidMobile, mobileOnly, money, plural } from '@/lib/format';
import { useStockAccess } from '@/lib/stock-access';
import { cn } from '@/lib/utils';
import { CONSUME_MODES, PART_CATEGORIES } from '@shared/domain';
import type { PartListItem, SupplierListItem } from '@/lib/types';
import SheetSync from './SheetSync';
import Settings from './Settings';

const TABS = [
  { key: 'items', label: 'All Items', icon: Package },
  { key: 'low', label: 'Low Stock', icon: AlertTriangle },
  { key: 'in', label: 'Stock In', icon: PackagePlus },
  { key: 'out', label: 'Stock Out', icon: PackageMinus },
  { key: 'suppliers', label: 'Suppliers', icon: Building2 },
  { key: 'sync', label: 'Sheet Sync', icon: FileSpreadsheet },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/**
 * JMR - STOCK. One screen with every stock job on it, behind the PIN:
 * items, low stock, stock in, stock out, suppliers, sheet sync and settings.
 */
export default function StockDesktop(): JSX.Element {
  const { unlocked, lock } = useStockAccess();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') ?? 'items';
  const tab = (TABS.find((entry) => entry.key === raw)?.key ?? 'items') as TabKey;

  const setTab = (next: TabKey): void => {
    const copy = new URLSearchParams(params);
    if (next === 'items') copy.delete('tab');
    else copy.set('tab', next);
    setParams(copy, { replace: true });
  };

  if (!unlocked) return <StockGate />;

  return (
    <div className="space-y-4 pb-4">
      <PageHeader
        title="JMR — STOCK"
        subtitle="Everything about items, suppliers and sync"
        action={
          <Button variant="outline" onClick={lock} className="gap-2">
            <Lock className="h-4 w-4" />
            <span className="hidden sm:inline">Lock</span>
          </Button>
        }
      />

      <StockSummaryStrip onPick={setTab} />

      <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3">
        {TABS.map((entry) => {
          const active = entry.key === tab;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              className={cn(
                'flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border-2 px-4 text-sm font-bold transition-colors',
                active
                  ? 'border-success bg-success text-success-foreground'
                  : 'border-border bg-card text-foreground',
              )}
            >
              <entry.icon className="h-4 w-4" />
              {entry.label}
            </button>
          );
        })}
      </div>

      {tab === 'items' ? <ItemsSection /> : null}
      {tab === 'low' ? <ItemsSection lowOnly /> : null}
      {tab === 'in' ? <StockInSection /> : null}
      {tab === 'out' ? <StockOutSection /> : null}
      {tab === 'suppliers' ? <SuppliersSection /> : null}
      {tab === 'sync' ? <SheetSync /> : null}
      {tab === 'settings' ? <Settings /> : null}
    </div>
  );
}

function StockSummaryStrip({
  onPick,
}: {
  onPick: (tab: TabKey) => void;
}): JSX.Element {
  const { data, isLoading } = useStockSummary();
  if (isLoading && !data) return <LoadingBlock label="Loading stock..." />;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <button type="button" onClick={() => onPick('items')} className="text-left">
        <MiniStat label="Items" value={data?.items ?? 0} icon={Package} />
      </button>
      <button type="button" onClick={() => onPick('items')} className="text-left">
        <MiniStat label="Units" value={data?.units ?? 0} icon={Boxes} />
      </button>
      <button type="button" onClick={() => onPick('items')} className="text-left">
        <MiniStat label="Stock Value" value={money(data?.value ?? 0)} icon={Wallet} tone="success" />
      </button>
      <button type="button" onClick={() => onPick('low')} className="text-left">
        <MiniStat
          label="Low Stock"
          value={data?.low ?? 0}
          icon={AlertTriangle}
          tone={(data?.low ?? 0) > 0 ? 'warning' : 'default'}
        />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

function ItemsSection({ lowOnly = false }: { lowOnly?: boolean }): JSX.Element {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 200);
  const { data, isLoading, error, refetch } = useParts(debounced, lowOnly);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<PartListItem | null>(null);
  const [menuFor, setMenuFor] = useState<PartListItem | null>(null);

  const items = data ?? [];

  return (
    <SectionCard
      title={lowOnly ? 'Low Stock Items' : 'All Items'}
      icon={lowOnly ? AlertTriangle : Package}
      action={
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add
        </Button>
      }
    >
      {items.length > 5 || search ? (
        <div className="relative mb-3">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="items-search"
            name="items-search"
            aria-label="Search items"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search item, brand or model"
            className="pl-11"
          />
        </div>
      ) : null}

      {error && !data ? (
        <ErrorBlock message={error.message} onRetry={() => void refetch()} />
      ) : isLoading && !data ? (
        <LoadingBlock label="Loading items..." />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={lowOnly ? 'Nothing is running low' : 'No items yet'}
          description={
            lowOnly
              ? 'Every item is above its minimum level.'
              : 'Add the parts and packaging you keep on the shelf.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {items.map((part) => (
            <li
              key={part.id}
              className="flex items-center gap-3 rounded-xl border-2 p-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{part.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[part.brand, part.model].filter(Boolean).join(' ') || part.category}
                  {part.supplierName ? ` · ${part.supplierName}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={cn(
                    'tabular text-base font-black',
                    part.quantity <= 0
                      ? 'text-destructive'
                      : part.low
                        ? 'text-warning-foreground'
                        : 'text-foreground',
                  )}
                >
                  {part.quantity}
                </p>
                <p className="text-2xs text-muted-foreground">min {part.minQuantity}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMenuFor(part)}
                aria-label={`Actions for ${part.name}`}
                className="shrink-0"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ItemSheet open={addOpen} onOpenChange={setAddOpen} />
      <ItemSheet
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        part={editing}
      />
      <ItemMenuSheet
        part={menuFor}
        onClose={() => setMenuFor(null)}
        onEdit={(part) => {
          setMenuFor(null);
          setEditing(part);
        }}
      />
    </SectionCard>
  );
}

/** Add / edit sheet. Two columns on a desktop screen, one on a phone. */
function ItemSheet({
  open,
  onOpenChange,
  part,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part?: PartListItem | null;
}): JSX.Element {
  const toast = useToast();
  const createPart = useCreatePart();
  const updatePart = useUpdatePart(part?.id ?? '');
  const { data: supplierList } = useSuppliers();
  const [touched, setTouched] = useState(false);
  const [form, setForm] = useState(emptyItemForm());

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setForm(
      part
        ? {
            name: part.name,
            category: part.category,
            brand: part.brand,
            model: part.model,
            quantity: String(part.quantity),
            minQuantity: String(part.minQuantity),
            purchaseCost: String(part.purchaseCost),
            sellingPrice: String(part.sellingPrice),
            supplierId: part.supplierId,
            consumeMode: part.consumeMode,
          }
        : emptyItemForm(),
    );
  }, [open, part]);

  const nameError = form.name.trim() ? '' : 'Item name is required';
  const set = <K extends keyof ItemForm>(key: K, value: ItemForm[K]): void =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async (): Promise<void> => {
    setTouched(true);
    if (nameError) return;
    const payload = {
      name: form.name.trim(),
      category: form.category,
      brand: form.brand.trim(),
      model: form.model.trim(),
      minQuantity: Number(form.minQuantity) || 0,
      purchaseCost: Number(form.purchaseCost) || 0,
      sellingPrice: Number(form.sellingPrice) || 0,
      supplierId: form.supplierId,
      consumeMode: form.consumeMode,
      ...(part ? {} : { quantity: Number(form.quantity) || 0 }),
    };
    try {
      if (part) {
        await updatePart.mutateAsync(payload);
        toast.success('Item updated', form.name.trim());
      } else {
        await createPart.mutateAsync(payload);
        toast.success('Item added', form.name.trim());
      }
      onOpenChange(false);
    } catch (caught) {
      toast.error('Could not save item', caught instanceof Error ? caught.message : undefined);
    }
  };

  const busy = createPart.isPending || updatePart.isPending;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={part ? 'Edit item' : 'Add item'}
      description={part ? 'Quantity changes through Stock In or Stock Out.' : 'Opening quantity is recorded as Stock In.'}
      className="sm:max-w-2xl"
    >
      <div className="space-y-3 pb-2">
        <Field label="Item Name" htmlFor="item-name" error={touched ? nameError || null : null}>
          <Input
            id="item-name"
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder="Mobile display"
            invalid={touched && Boolean(nameError)}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category" htmlFor="item-category">
            <Select
              value={form.category}
              onValueChange={(value) => set('category', value)}
              options={PART_CATEGORIES.map((c) => ({ value: c, label: c }))}
            />
          </Field>
          <Field label="Supplier" htmlFor="item-supplier" optional>
            <Select
              value={form.supplierId}
              onValueChange={(value) => set('supplierId', value)}
              options={(supplierList ?? []).map((s) => ({ value: s.id, label: s.name }))}
              allowEmpty
              emptyLabel="No supplier"
            />
          </Field>
          <Field label="Brand" htmlFor="item-brand" optional>
            <Input
              id="item-brand"
              value={form.brand}
              onChange={(event) => set('brand', event.target.value)}
              placeholder="Samsung"
            />
          </Field>
          <Field label="Model" htmlFor="item-model" optional>
            <Input
              id="item-model"
              value={form.model}
              onChange={(event) => set('model', event.target.value)}
              placeholder="M30"
            />
          </Field>
          {part ? null : (
            <Field label="Opening Quantity" htmlFor="item-quantity">
              <Input
                id="item-quantity"
                type="number"
                inputMode="numeric"
                min={0}
                value={form.quantity}
                onChange={(event) => set('quantity', event.target.value)}
              />
            </Field>
          )}
          <Field label="Low Stock Level" htmlFor="item-min">
            <Input
              id="item-min"
              type="number"
              inputMode="numeric"
              min={0}
              value={form.minQuantity}
              onChange={(event) => set('minQuantity', event.target.value)}
              hint="Shown as low at or below this."
            />
          </Field>
          <Field label="Purchase Cost" htmlFor="item-cost">
            <Input
              id="item-cost"
              type="number"
              inputMode="decimal"
              min={0}
              value={form.purchaseCost}
              onChange={(event) => set('purchaseCost', event.target.value)}
            />
          </Field>
          <Field label="Selling Price" htmlFor="item-price">
            <Input
              id="item-price"
              type="number"
              inputMode="decimal"
              min={0}
              value={form.sellingPrice}
              onChange={(event) => set('sellingPrice', event.target.value)}
            />
          </Field>
          <Field label="Stock Leaves" htmlFor="item-consume">
            <Select
              value={form.consumeMode}
              onValueChange={(value) => set('consumeMode', value as ItemForm['consumeMode'])}
              options={CONSUME_MODES.map((mode) => ({
                value: mode,
                label: mode === 'PART_USED' ? 'When part is used' : 'On delivery',
              }))}
            />
          </Field>
        </div>

        <Button
          size="lg"
          className="w-full"
          loading={busy}
          loadingText="Saving..."
          onClick={() => void save()}
        >
          {part ? 'Save Changes' : 'Add Item'}
        </Button>
      </div>
    </Sheet>
  );
}

interface ItemForm {
  name: string;
  category: string;
  brand: string;
  model: string;
  quantity: string;
  minQuantity: string;
  purchaseCost: string;
  sellingPrice: string;
  supplierId: string;
  consumeMode: string;
}

function emptyItemForm(): ItemForm {
  return {
    name: '',
    category: 'Repair Part',
    brand: '',
    model: '',
    quantity: '0',
    minQuantity: '0',
    purchaseCost: '',
    sellingPrice: '',
    supplierId: '',
    consumeMode: 'PART_USED',
  };
}

/** The three things you can do to one item. */
function ItemMenuSheet({
  part,
  onClose,
  onEdit,
}: {
  part: PartListItem | null;
  onClose: () => void;
  onEdit: (part: PartListItem) => void;
}): JSX.Element {
  const toast = useToast();
  const deletePart = useDeletePart();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (part) setConfirming(false);
  }, [part]);

  const remove = async (): Promise<void> => {
    if (!part) return;
    try {
      await deletePart.mutateAsync(part.id);
      toast.success('Item removed', `${part.name} is off the shelf.`);
      onClose();
    } catch (caught) {
      toast.error('Could not remove item', caught instanceof Error ? caught.message : undefined);
    }
  };

  return (
    <Sheet open={Boolean(part)} onOpenChange={(open) => !open && onClose()} title={part?.name ?? ''}>
      <div className="space-y-2 pb-2">
        {confirming ? (
          <>
            <InlineNotice tone="error">
              Remove <strong>{part?.name}</strong> from the item list? Past bills and stock movements keep
              their record.
            </InlineNotice>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
              <Button
                variant="destructive"
                loading={deletePart.isPending}
                onClick={() => void remove()}
              >
                Yes, remove
              </Button>
            </div>
          </>
        ) : (
          <>
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => part && onEdit(part)}>
              <Pencil className="h-5 w-5" /> Edit item
            </Button>
            <Button asChild variant="outline" className="w-full justify-start gap-2">
              <Link to={`/parts/${part?.id ?? ''}`} onClick={onClose}>
                <History className="h-5 w-5" /> Stock history
              </Link>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-destructive"
              onClick={() => setConfirming(true)}
            >
              <Trash2 className="h-5 w-5" /> Remove item
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Stock in / out                                                       */
/* ------------------------------------------------------------------ */

function StockInSection(): JSX.Element {
  const toast = useToast();
  const stockIn = useStockIn();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [part, setPart] = useState<PartListItem | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');

  const amount = Number(quantity) || 0;
  const ready = Boolean(part) && amount > 0;

  const save = async (): Promise<void> => {
    if (!part || !ready) return;
    try {
      await stockIn.mutateAsync({
        partId: part.id,
        quantity: amount,
        reason: reason.trim() || 'Stock received',
        idempotencyKey: crypto.randomUUID(),
      });
      toast.success('Stock added', `${part.name} is now ${part.quantity + amount}.`);
      setPart(null);
      setQuantity('1');
      setReason('');
    } catch (caught) {
      toast.error('Could not add stock', caught instanceof Error ? caught.message : undefined);
    }
  };

  return (
    <SectionCard title="Stock In" icon={PackagePlus}>
      {!part ? (
        <Button className="w-full gap-2" onClick={() => setPickerOpen(true)}>
          <SearchIcon className="h-5 w-5" /> Choose item
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 rounded-xl border-2 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{part.name}</p>
              <p className="text-xs text-muted-foreground">now {part.quantity} in stock</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPart(null)}>
              Change
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Quantity" htmlFor="in-qty">
              <Input
                id="in-qty"
                type="number"
                inputMode="numeric"
                min={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="h-14 text-xl font-black"
              />
            </Field>
            <Field label="Reason" htmlFor="in-reason" optional>
              <Input
                id="in-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Stock received"
              />
            </Field>
          </div>
          <div className="flex gap-2">
            {[1, 5, 10].map((n) => (
              <Button key={n} variant="outline" size="sm" onClick={() => setQuantity(String(n))}>
                +{n}
              </Button>
            ))}
          </div>
          <Button
            size="lg"
            className="w-full"
            loading={stockIn.isPending}
            disabled={!ready}
            onClick={() => void save()}
          >
            Add {amount > 0 ? amount : ''} to stock
          </Button>
        </div>
      )}

      <PartPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(picked) => setPart(picked)}
        title="Add stock for"
      />
    </SectionCard>
  );
}

function StockOutSection(): JSX.Element {
  const toast = useToast();
  const stockOut = useStockOut();
  const stockReturn = useStockReturn();
  const [mode, setMode] = useState<'out' | 'return'>('out');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [part, setPart] = useState<PartListItem | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [orderId, setOrderId] = useState('');

  const amount = Number(quantity) || 0;
  const needsOrder = mode === 'out' && /repair|used|order/i.test(reason);
  const tooMuch = part !== null && amount > part.quantity;
  const ready = part !== null && amount > 0 && !tooMuch && (!needsOrder || orderId.trim().length > 0);

  const save = async (): Promise<void> => {
    if (!part || !ready) return;
    const payload = {
      partId: part.id,
      quantity: amount,
      reason: reason.trim() || (mode === 'out' ? 'Used for repair' : 'Returned to stock'),
      orderId: orderId.trim(),
      idempotencyKey: crypto.randomUUID(),
    };
    try {
      if (mode === 'out') {
        await stockOut.mutateAsync(payload);
        toast.success('Stock reduced', `${part.name} is now ${part.quantity - amount}.`);
      } else {
        await stockReturn.mutateAsync(payload);
        toast.success('Stock returned', `${part.name} is now ${part.quantity + amount}.`);
      }
      setPart(null);
      setQuantity('1');
      setReason('');
      setOrderId('');
    } catch (caught) {
      toast.error('Could not update stock', caught instanceof Error ? caught.message : undefined);
    }
  };

  return (
    <SectionCard title="Stock Out / Return" icon={PackageMinus}>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode('out')}
          className={cn(
            'min-h-[52px] rounded-xl border-2 text-sm font-bold',
            mode === 'out' ? 'border-destructive bg-destructive/5 text-destructive' : 'border-border',
          )}
        >
          Stock Out
        </button>
        <button
          type="button"
          onClick={() => setMode('return')}
          className={cn(
            'min-h-[52px] rounded-xl border-2 text-sm font-bold',
            mode === 'return' ? 'border-success bg-success/5 text-success' : 'border-border',
          )}
        >
          Return
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {!part ? (
          <Button className="w-full gap-2" onClick={() => setPickerOpen(true)}>
            <SearchIcon className="h-5 w-5" /> Choose item
          </Button>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 rounded-xl border-2 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{part.name}</p>
                <p className="text-xs text-muted-foreground">{part.quantity} in stock</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPart(null)}>
                Change
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Quantity" htmlFor="out-qty" error={tooMuch ? 'More than in stock' : null}>
                <Input
                  id="out-qty"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  invalid={tooMuch}
                  className="h-14 text-xl font-black"
                />
              </Field>
              <Field label="Reason" htmlFor="out-reason" optional>
                <Input
                  id="out-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={mode === 'out' ? 'Used for repair' : 'Returned to stock'}
                />
              </Field>
            </div>
            {needsOrder ? (
              <Field label="Bill No." htmlFor="out-order" hint="Needed when the reason mentions a repair.">
                <Input
                  id="out-order"
                  value={orderId}
                  onChange={(event) => setOrderId(event.target.value.toUpperCase())}
                  placeholder="JMR-0001"
                  className="tabular"
                />
              </Field>
            ) : null}
            <Button
              size="lg"
              className="w-full"
              variant={mode === 'out' ? 'destructive' : 'success'}
              loading={stockOut.isPending || stockReturn.isPending}
              disabled={!ready}
              onClick={() => void save()}
            >
              {mode === 'out' ? 'Reduce stock' : 'Return to stock'}
            </Button>
          </>
        )}
      </div>

      <PartPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(picked) => setPart(picked)}
        title="Take from"
      />
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Suppliers                                                           */
/* ------------------------------------------------------------------ */

function SuppliersSection(): JSX.Element {
  const toast = useToast();
  const { data, isLoading, error, refetch } = useSuppliers();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const deleteSupplier = useDeleteSupplier();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<SupplierListItem | null>(null);
  const [menuFor, setMenuFor] = useState<SupplierListItem | null>(null);

  const all = data ?? [];
  const q = search.trim().toLowerCase();
  const suppliers = q
    ? all.filter((s) => s.name.toLowerCase().includes(q) || s.mobile.includes(q))
    : all;

  return (
    <SectionCard
      title="Suppliers"
      icon={Building2}
      action={
        <Button size="sm" className="gap-1.5" onClick={() => setEditing(EMPTY_SUPPLIER)}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      }
    >
      {all.length > 5 ? (
        <div className="relative mb-3">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="suppliers-search"
            name="suppliers-search"
            aria-label="Search suppliers"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Supplier name or number"
            className="pl-11"
          />
        </div>
      ) : null}

      {error && !data ? (
        <ErrorBlock message={error.message} onRetry={() => void refetch()} />
      ) : isLoading && !data ? (
        <LoadingBlock label="Loading suppliers..." />
      ) : suppliers.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={q ? 'No matching supplier' : 'No suppliers yet'}
          description="Add the people you buy parts and packaging from."
        />
      ) : (
        <ul className="space-y-2">
          {suppliers.map((supplier) => (
            <li key={supplier.id} className="flex items-center gap-3 rounded-xl border-2 p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{supplier.name}</p>
                <p className="tabular truncate text-xs text-muted-foreground">
                  {supplier.mobile || 'No number'} · {plural(supplier.itemCount, 'item')}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Actions for ${supplier.name}`}
                onClick={() => setMenuFor(supplier)}
                className="shrink-0"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <SupplierSheet
        supplier={editing}
        onClose={() => setEditing(null)}
        onSave={async (body) => {
          if (!editing) return;
          try {
            if (editing.id) {
              await updateSupplier.mutateAsync({ id: editing.id, body });
              toast.success('Supplier updated', body.name as string);
            } else {
              await createSupplier.mutateAsync(body);
              toast.success('Supplier added', body.name as string);
            }
            setEditing(null);
          } catch (caught) {
            toast.error('Could not save supplier', caught instanceof Error ? caught.message : undefined);
          }
        }}
        busy={createSupplier.isPending || updateSupplier.isPending}
      />

      <Sheet
        open={Boolean(menuFor)}
        onOpenChange={(open) => !open && setMenuFor(null)}
        title={menuFor?.name ?? ''}
      >
        <div className="space-y-2 pb-2">
          {menuFor?.mobile ? (
            <a
              href={`tel:${menuFor.mobile}`}
              className="flex min-h-[48px] w-full items-center gap-3 rounded-xl border-2 px-4 font-semibold"
            >
              Call {menuFor.mobile}
            </a>
          ) : null}
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => {
              if (menuFor) setEditing(menuFor);
              setMenuFor(null);
            }}
          >
            <Pencil className="h-5 w-5" /> Edit supplier
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-destructive"
            loading={deleteSupplier.isPending}
            onClick={async () => {
              if (!menuFor) return;
              try {
                await deleteSupplier.mutateAsync(menuFor.id);
                toast.success('Supplier removed', menuFor.name);
              } catch (caught) {
                toast.error(
                  'Could not remove supplier',
                  caught instanceof Error ? caught.message : undefined,
                );
              }
              setMenuFor(null);
            }}
          >
            <Trash2 className="h-5 w-5" /> Remove supplier
          </Button>
        </div>
      </Sheet>
    </SectionCard>
  );
}

const EMPTY_SUPPLIER = { id: '', name: '', mobile: '', notes: '' } as SupplierListItem;

function SupplierSheet({
  supplier,
  onClose,
  onSave,
  busy,
}: {
  supplier: SupplierListItem | null;
  onClose: () => void;
  onSave: (body: { name: string; mobile: string; notes: string }) => Promise<void>;
  busy: boolean;
}): JSX.Element {
  const [form, setForm] = useState({ name: '', mobile: '', notes: '' });
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!supplier) return;
    setTouched(false);
    setForm({ name: supplier.name, mobile: supplier.mobile, notes: supplier.notes });
  }, [supplier]);

  const nameError = form.name.trim() ? '' : 'Supplier name is required';
  const mobileError = !form.mobile || isValidMobile(form.mobile) ? '' : 'Enter a valid 10 digit number';

  return (
    <Sheet
      open={Boolean(supplier)}
      onOpenChange={(open) => !open && onClose()}
      title={supplier?.id ? 'Edit supplier' : 'Add supplier'}
    >
      <div className="space-y-3 pb-2">
        <Field label="Supplier Name" htmlFor="supplier-name" error={touched ? nameError || null : null}>
          <Input
            id="supplier-name"
            value={form.name}
            onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))}
            placeholder="Mobile wholesale market"
            invalid={touched && Boolean(nameError)}
          />
        </Field>
        <Field label="Mobile" htmlFor="supplier-mobile" optional error={touched ? mobileError || null : null}>
          <Input
            id="supplier-mobile"
            {...numberPad}
            value={form.mobile}
            onChange={(event) =>
              setForm((c) => ({ ...c, mobile: mobileOnly(event.target.value).slice(0, 10) }))
            }
            invalid={touched && Boolean(mobileError)}
          />
        </Field>
        <Field label="Notes" htmlFor="supplier-notes" optional>
          <Textarea
            id="supplier-notes"
            value={form.notes}
            onChange={(event) => setForm((c) => ({ ...c, notes: event.target.value }))}
            placeholder="Gujarat market, best rate for displays"
            className="min-h-[70px]"
          />
        </Field>
        <Button
          size="lg"
          className="w-full"
          loading={busy}
          onClick={async () => {
            setTouched(true);
            if (nameError || mobileError) return;
            await onSave({
              name: form.name.trim(),
              mobile: form.mobile ? mobileOnly(form.mobile) : '',
              notes: form.notes.trim(),
            });
          }}
        >
          Save Supplier
        </Button>
      </div>
    </Sheet>
  );
}
