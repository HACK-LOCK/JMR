import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FilterX, Package, Plus } from 'lucide-react';
import { CONSUME_MODES, CONSUME_MODE_LABELS, PART_CATEGORIES } from '@shared/domain';
import { PageHeader, SearchField } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { ConsumeBadge } from '@/components/status-badge';
import { useCreatePart, useParts, useSuppliers } from '@/hooks/use-queries';
import { useDebounced } from '@/lib/hooks';
import { money, plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PartListItem } from '@/lib/types';

export default function Parts(): JSX.Element {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 250);
  const [lowOnly, setLowOnly] = useState(false);
  const { data, isLoading, error, refetch } = useParts(debounced, lowOnly);
  const [addOpen, setAddOpen] = useState(false);

  const parts = data ?? [];
  const totalValue = parts.reduce((sum, part) => sum + part.stockValue, 0);

  return (
    <div className="space-y-3">
      <PageHeader
        title="All Items"
        subtitle={`${plural(parts.length, 'item')} - ${money(totalValue)} at purchase cost`}
        action={
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-5 w-5" />
            <span className="hidden sm:inline">Add item</span>
          </Button>
        }
      />

      <SearchField value={search} onChange={setSearch} placeholder="Item, brand or model" />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setLowOnly(false)}
          className={cn(
            'min-h-[44px] flex-1 rounded-xl border-2 text-sm font-bold transition-colors',
            !lowOnly ? 'border-success bg-success text-success-foreground' : 'border-border bg-card',
          )}
        >
          All items
        </button>
        <button
          type="button"
          onClick={() => setLowOnly(true)}
          className={cn(
            'flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border-2 text-sm font-bold transition-colors',
            lowOnly ? 'border-destructive bg-destructive text-destructive-foreground' : 'border-border bg-card',
          )}
        >
          <FilterX className="h-4 w-4" /> Low stock
        </button>
      </div>

      {error && !data ? (
        <ErrorBlock message={error.message} onRetry={() => void refetch()} />
      ) : isLoading && !data ? (
        <LoadingBlock label="Loading items..." />
      ) : parts.length === 0 ? (
        <EmptyState
          icon={Package}
          title={search ? 'No matching item' : lowOnly ? 'Nothing is running low' : 'No items yet'}
          description={
            search
              ? 'Try a shorter name, or search by brand.'
              : lowOnly
                ? 'Every item is above its minimum level.'
                : 'Add the parts and consumables you keep in the shop to start tracking stock.'
          }
          action={
            <Button onClick={() => setAddOpen(true)} className="gap-2">
              <Plus className="h-5 w-5" /> Add item
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {parts.map((part) => (
            <li key={part.id}>
              <PartCard part={part} />
            </li>
          ))}
        </ul>
      )}

      <AddPartSheet open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function PartCard({ part }: { part: PartListItem }): JSX.Element {
  return (
    <Link to={`/parts/${part.id}`} className="card-tap block">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold leading-tight">{part.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[part.brand, part.model].filter(Boolean).join(' ') || part.category}
            {part.supplierName ? ` - ${part.supplierName}` : ''}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ConsumeBadge mode={part.consumeMode} />
            {part.low ? (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-2xs font-bold text-destructive">
                Low stock
              </span>
            ) : null}
            {part.usedInOpenOrders > 0 ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-bold text-primary">
                {part.usedInOpenOrders} reserved
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
          <p className="text-2xs text-muted-foreground">min {part.minQuantity}</p>
          {part.sellingPrice > 0 ? (
            <p className="tabular mt-1 text-2xs text-muted-foreground">sell {money(part.sellingPrice)}</p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function AddPartSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const toast = useToast();
  const createPart = useCreatePart();
  const { data: suppliers } = useSuppliers();
  const [touched, setTouched] = useState(false);
  const [form, setForm] = useState({
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
  });

  const nameError = form.name.trim() ? '' : 'Item name is required';
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async (): Promise<void> => {
    setTouched(true);
    if (nameError) return;
    try {
      await createPart.mutateAsync({
        name: form.name.trim(),
        category: form.category,
        brand: form.brand.trim(),
        model: form.model.trim(),
        quantity: Number(form.quantity) || 0,
        minQuantity: Number(form.minQuantity) || 0,
        purchaseCost: Number(form.purchaseCost) || 0,
        sellingPrice: Number(form.sellingPrice) || 0,
        supplierId: form.supplierId,
        consumeMode: form.consumeMode,
      });
      toast.success('Item added', form.name.trim());
      setForm({
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
      });
      setTouched(false);
      onOpenChange(false);
    } catch (caught) {
      toast.error('Could not add item', caught instanceof Error ? caught.message : undefined);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add stock item"
      description="Set the minimum level so the app warns you before you run out."
    >
      <div className="space-y-3 pb-2">
        <Field label="Item Name" htmlFor="part-name" error={touched ? nameError || null : null}>
          <Input
            id="part-name"
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder="Samsung M30 Display"
            invalid={touched && Boolean(nameError)}
            className="h-14"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" htmlFor="part-category">
            <Select
              value={form.category}
              onValueChange={(value) => set('category', value)}
              options={PART_CATEGORIES.map((category) => ({ value: category, label: category }))}
            />
          </Field>
          <Field label="Supplier" htmlFor="part-supplier" optional>
            <Select
              value={form.supplierId}
              onValueChange={(value) => set('supplierId', value)}
              options={(suppliers ?? []).map((supplier) => ({ value: supplier.id, label: supplier.name }))}
              placeholder="No supplier"
              allowEmpty
              emptyLabel="No supplier"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand" htmlFor="part-brand" optional>
            <Input id="part-brand" value={form.brand} onChange={(event) => set('brand', event.target.value)} />
          </Field>
          <Field label="Model" htmlFor="part-model" optional>
            <Input id="part-model" value={form.model} onChange={(event) => set('model', event.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity in Stock" htmlFor="part-qty">
            <Input
              id="part-qty"
              type="number"
              inputMode="numeric"
              value={form.quantity}
              onChange={(event) => set('quantity', event.target.value)}
              className="h-14 text-lg"
            />
          </Field>
          <Field label="Warn Me Below" htmlFor="part-min" hint="Low stock alert level">
            <Input
              id="part-min"
              type="number"
              inputMode="numeric"
              value={form.minQuantity}
              onChange={(event) => set('minQuantity', event.target.value)}
              className="h-14 text-lg"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Purchase Cost" htmlFor="part-cost" optional>
            <Input
              id="part-cost"
              type="number"
              inputMode="decimal"
              value={form.purchaseCost}
              onChange={(event) => set('purchaseCost', event.target.value)}
              className="h-14 text-lg"
            />
          </Field>
          <Field label="Selling Price" htmlFor="part-price" optional>
            <Input
              id="part-price"
              type="number"
              inputMode="decimal"
              value={form.sellingPrice}
              onChange={(event) => set('sellingPrice', event.target.value)}
              className="h-14 text-lg"
            />
          </Field>
        </div>

        <Field
          label="When should stock reduce?"
          htmlFor="part-consume"
          hint="Repair parts leave stock when you tap Part Used. Folders and packaging leave stock when the device is handed over."
        >
          <Select
            value={form.consumeMode}
            onValueChange={(value) => set('consumeMode', value)}
            options={CONSUME_MODES.map((mode) => ({ value: mode, label: CONSUME_MODE_LABELS[mode] }))}
          />
        </Field>

        <Button size="lg" className="w-full" loading={createPart.isPending} onClick={() => void save()}>
          Save Item
        </Button>
      </div>
    </Sheet>
  );
}
