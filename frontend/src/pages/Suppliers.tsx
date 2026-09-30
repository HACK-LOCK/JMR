import { useState } from 'react';
import { Building2, Phone, Plus } from 'lucide-react';
import { PageHeader, SearchField } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/feedback';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { useCreateSupplier, useSuppliers } from '@/hooks/use-queries';
import { useDebounced } from '@/lib/hooks';
import { isValidMobile, mobileOnly, money, plural } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function Suppliers(): JSX.Element {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 200);
  const { data, isLoading, error, refetch } = useSuppliers();
  const [addOpen, setAddOpen] = useState(false);

  const all = data ?? [];
  const q = debounced.trim().toLowerCase();
  const suppliers = q
    ? all.filter(
        (supplier) =>
          supplier.name.toLowerCase().includes(q) || supplier.mobile.includes(q),
      )
    : all;

  return (
    <div className="space-y-3">
      <PageHeader
        title="Suppliers"
        subtitle={`${plural(all.length, 'supplier')} - ${money(
          all.reduce((sum, supplier) => sum + supplier.stockValue, 0),
        )} stock value`}
        action={
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-5 w-5" />
            <span className="hidden sm:inline">Add</span>
          </Button>
        }
      />

      {all.length > 6 ? <SearchField value={search} onChange={setSearch} placeholder="Supplier name or number" /> : null}

      {error && !data ? (
        <ErrorBlock message={error.message} onRetry={() => void refetch()} />
      ) : isLoading && !data ? (
        <LoadingBlock label="Loading suppliers..." />
      ) : suppliers.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={q ? 'No matching supplier' : 'No suppliers yet'}
          description="Add the people you buy parts and packaging from, so you know where stock came from."
        />
      ) : (
        <ul className="space-y-2.5">
          {suppliers.map((supplier) => (
            <li key={supplier.id}>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-bold">{supplier.name}</p>
                      {supplier.mobile ? (
                        <a
                          href={`tel:${supplier.mobile}`}
                          className="tabular inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
                        >
                          <Phone className="h-4 w-4" /> {supplier.mobile}
                        </a>
                      ) : (
                        <p className="text-sm text-muted-foreground">No number saved</p>
                      )}
                      {supplier.notes ? (
                        <p className="mt-1 text-xs text-muted-foreground">{supplier.notes}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-sm font-black">{supplier.itemCount}</p>
                      <p className="text-2xs text-muted-foreground">items</p>
                      {supplier.stockValue > 0 ? (
                        <p className={cn('tabular mt-1 text-2xs text-muted-foreground')}>
                          {money(supplier.stockValue)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <AddSupplierSheet open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function AddSupplierSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const toast = useToast();
  const createSupplier = useCreateSupplier();
  const [form, setForm] = useState({ name: '', mobile: '', notes: '' });
  const [touched, setTouched] = useState(false);

  const nameError = form.name.trim() ? '' : 'Supplier name is required';
  const mobileError = !form.mobile || isValidMobile(form.mobile) ? '' : 'Enter a valid 10 digit number';

  const save = async (): Promise<void> => {
    setTouched(true);
    if (nameError || mobileError) return;
    try {
      await createSupplier.mutateAsync({
        name: form.name.trim(),
        mobile: form.mobile ? mobileOnly(form.mobile) : '',
        notes: form.notes.trim(),
      });
      toast.success('Supplier added', form.name.trim());
      setForm({ name: '', mobile: '', notes: '' });
      setTouched(false);
      onOpenChange(false);
    } catch (caught) {
      toast.error('Could not add supplier', caught instanceof Error ? caught.message : undefined);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add supplier"
      description="Then pick them while adding a stock item."
    >
      <div className="space-y-3 pb-2">
        <Field label="Supplier Name" htmlFor="supplier-name" error={touched ? nameError || null : null}>
          <Input
            id="supplier-name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Mobile wholesale market"
            invalid={touched && Boolean(nameError)}
            className="h-14"
          />
        </Field>
        <Field
          label="Mobile"
          htmlFor="supplier-mobile"
          optional
          error={touched ? mobileError || null : null}
        >
          <Input
            id="supplier-mobile"
            type="tel"
            inputMode="numeric"
            value={form.mobile}
            onChange={(event) =>
              setForm((current) => ({ ...current, mobile: mobileOnly(event.target.value).slice(0, 10) }))
            }
            invalid={touched && Boolean(mobileError)}
            className="h-14"
          />
        </Field>
        <Field label="Notes" htmlFor="supplier-notes" optional>
          <Textarea
            id="supplier-notes"
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Gujarat market, best rate for displays"
            className="min-h-[70px]"
          />
        </Field>
        <Button size="lg" className="w-full" loading={createSupplier.isPending} onClick={() => void save()}>
          Save Supplier
        </Button>
      </div>
    </Sheet>
  );
}
