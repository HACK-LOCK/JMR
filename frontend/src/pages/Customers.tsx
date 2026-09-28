import { useState } from 'react';
import { Columns3, FileSpreadsheet, FileText, History, Phone, UserPlus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader, SearchField } from '@/components/app-shell';
import { CustomerColumnSheet } from '@/components/customer-column-sheet';
import { CustomerHistoryPanel } from '@/components/customer-history-panel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DownloadMenu, type DownloadOption } from '@/components/ui/download-menu';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/feedback';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { useCreateCustomer, useCustomerHistory } from '@/hooks/use-queries';
import { downloadProtectedFile } from '@/lib/api';
import { useCustomerExportColumns } from '@/lib/customer-columns';
import { useDebounced } from '@/lib/hooks';
import { isValidMobile, mobileOnly, money, plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CustomerHistoryRow } from '@/lib/types';

type CustomerFile = 'xlsx' | 'pdf';

/**
 * The file formats this screen writes. The list lives here, outside the page,
 * so a new format is one more line rather than one more button: the header
 * keeps the same width no matter how many formats there are.
 */
const DOWNLOAD_FORMATS: DownloadOption<CustomerFile>[] = [
  {
    id: 'xlsx',
    label: 'Excel spreadsheet',
    description: 'Opens in Excel or Google Sheets',
    icon: FileSpreadsheet,
  },
  {
    id: 'pdf',
    label: 'PDF',
    description: 'Prints as it looks on screen',
    icon: FileText,
  },
];

/**
 * Every customer, and everything the shop knows about them, on one screen.
 *
 * There used to be a second page called Customer History that repeated this
 * list with a few more columns. Tapping a person used to open a new page; it
 * now opens a popup with their details and their whole bill history, which is
 * what the person was actually looking for. One list, one place to look, and
 * the same rows behind the download buttons.
 *
 * A download is written in whichever columns the person ticked on the Columns
 * button, as a spreadsheet or as a PDF, and both files carry the same ticked
 * columns and nothing else.
 */
export default function Customers(): JSX.Element {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 250);
  const { data, isLoading, error, refetch } = useCustomerHistory(debounced);
  const [addOpen, setAddOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [downloading, setDownloading] = useState<CustomerFile | null>(null);
  const columns = useCustomerExportColumns();

  const customers = data ?? [];
  const totalDue = customers.reduce((sum, customer) => sum + customer.balanceDue, 0);
  const openCustomer = customers.find((customer) => customer.id === openId) ?? null;

  /**
   * The ticked columns go across as `cols`, so the server writes exactly those
   * and no others. A file with no `cols` would mean every column, which is not
   * what somebody who unticked three of them asked for.
   */
  const download = async (format: CustomerFile): Promise<void> => {
    if (customers.length === 0) {
      toast.error(
        'Nothing to download',
        debounced.trim() ? 'No customer found for this search.' : 'No customer data to export yet.',
      );
      return;
    }
    setDownloading(format);
    try {
      await downloadProtectedFile(
        `/customers/history.${format}?q=${encodeURIComponent(debounced)}&cols=${columns.query}`,
      );
      const columnNote = columns.narrowed
        ? ` in ${plural(columns.selected.length, 'column')}`
        : '';
      toast.success(
        format === 'pdf' ? 'PDF downloaded' : 'Excel downloaded',
        `${plural(customers.length, 'customer')}${columnNote} saved.`,
      );
    } catch (caught) {
      toast.error('Could not download', caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="Customers"
        subtitle={`${plural(customers.length, 'customer')}${totalDue > 0 ? ` - ${money(totalDue)} due in total` : ''}`}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setColumnsOpen(true)}
              aria-label="Choose which columns to download"
            >
              <Columns3 className="h-5 w-5" />
              <span className="hidden sm:inline">Columns</span>
              <span className="tabular text-2xs text-muted-foreground">{columns.selected.length}</span>
            </Button>
            <DownloadMenu
              options={DOWNLOAD_FORMATS}
              onPick={(format) => void download(format)}
              disabled={customers.length === 0}
              busy={downloading !== null}
            />
            <Button onClick={() => setAddOpen(true)} className="gap-2">
              <UserPlus className="h-5 w-5" />
              <span className="hidden sm:inline">Add</span>
            </Button>
          </div>
        }
      />

      <SearchField value={search} onChange={setSearch} placeholder="Name or mobile number" />


      {error && !data ? (
        <ErrorBlock message={error.message} onRetry={() => void refetch()} />
      ) : isLoading && !data ? (
        <LoadingBlock label="Loading customers..." />
      ) : customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? 'No matching customer' : 'No customers yet'}
          description={
            search ? 'Try a different name or mobile number.' : 'Customers are created automatically when you save a repair.'
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {customers.map((customer) => (
            <li key={customer.id}>
              <CustomerRow customer={customer} onOpen={() => setOpenId(customer.id)} />
            </li>
          ))}
        </ul>
      )}

      {/* One popup, filled with the person who was tapped. */}
      <Sheet
        open={openCustomer !== null}
        onOpenChange={(next) => {
          if (!next) setOpenId(null);
        }}
        title={openCustomer?.name ?? 'Customer'}
        description="Details and every bill this customer has brought in."
        className="sm:max-w-lg"
      >
        {openCustomer ? (
          <div className="space-y-3">
            <CustomerHistoryPanel id={openCustomer.id} />
            <Button variant="outline" className="w-full" asChild>
              <Link to={`/customers/${openCustomer.id}`}>Open full page</Link>
            </Button>
          </div>
        ) : null}
      </Sheet>

      <AddCustomerSheet open={addOpen} onOpenChange={setAddOpen} />

      <CustomerColumnSheet
        open={columnsOpen}
        onOpenChange={setColumnsOpen}
        choice={columns}
        rowCount={customers.length}
      />
    </div>
  );
}

/** One customer, one tap. The tap opens the popup rather than leaving the list. */
function CustomerRow({
  customer,
  onOpen,
}: {
  customer: CustomerHistoryRow;
  onOpen: () => void;
}): JSX.Element {
  return (
    <Card className="card-tap">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Show history for ${customer.name}`}
            className="min-w-0 flex-1 text-left"
          >
            <p className="truncate text-base font-bold leading-tight">{customer.name}</p>
            <p className="tabular truncate text-sm text-muted-foreground">{customer.mobile}</p>
            <p className="mt-1 text-2xs text-muted-foreground">
              {plural(customer.repairCount, 'repair')}
              {customer.lastRepairDate ? ` - last ${customer.lastRepairDate}` : ''}
            </p>
          </button>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {customer.balanceDue > 0 ? (
              <>
                <p className="tabular text-sm font-black text-destructive">
                  {money(customer.balanceDue)}
                </p>
                <p className="text-2xs text-muted-foreground">due</p>
              </>
            ) : (
              <p className="text-2xs font-bold text-success">No dues</p>
            )}
            {customer.totalBilled > 0 ? (
              <p className="tabular text-2xs text-muted-foreground">
                {money(customer.totalBilled)} billed
              </p>
            ) : null}
          </div>
        </div>

        {/* Call and history are separate taps: calling must not open the popup. */}
        <div className="mt-2.5 flex items-center gap-2">
          <a
            href={`tel:${customer.mobile}`}
            className={cn(
              'inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-2 border-border px-3 text-sm font-bold',
            )}
          >
            <Phone className="h-4 w-4" /> Call
          </a>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={onOpen}
            aria-label={`Show bill history for ${customer.name}`}
          >
            <History className="h-4 w-4" /> History
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddCustomerSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const toast = useToast();
  const createCustomer = useCreateCustomer();
  const [form, setForm] = useState({ name: '', mobile: '', altMobile: '', address: '', notes: '' });
  const [touched, setTouched] = useState(false);

  const nameError = form.name.trim() ? '' : 'Name is required';
  const mobileError = isValidMobile(form.mobile) ? '' : 'Enter a valid 10 digit number';
  const altError =
    !form.altMobile || isValidMobile(form.altMobile) ? '' : 'Enter a valid 10 digit number';

  const save = async (): Promise<void> => {
    setTouched(true);
    if (nameError || mobileError || altError) return;
    try {
      await createCustomer.mutateAsync({
        name: form.name.trim(),
        mobile: mobileOnly(form.mobile),
        altMobile: form.altMobile ? mobileOnly(form.altMobile) : '',
        address: form.address.trim(),
        notes: form.notes.trim(),
      });
      toast.success('Customer added', form.name.trim());
      setForm({ name: '', mobile: '', altMobile: '', address: '', notes: '' });
      setTouched(false);
      onOpenChange(false);
    } catch (caught) {
      toast.error('Could not add customer', caught instanceof Error ? caught.message : undefined);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add customer"
      description="Optional - a repair also creates the customer automatically."
    >
      <div className="space-y-3 pb-2">
        <Field label="Name" htmlFor="customer-name" error={touched ? nameError || null : null}>
          <Input
            id="customer-name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            invalid={touched && Boolean(nameError)}
            className="h-14"
          />
        </Field>
        <Field label="Mobile" htmlFor="customer-mobile" error={touched ? mobileError || null : null}>
          <Input
            id="customer-mobile"
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
        <Field label="Alternate Mobile" htmlFor="customer-alt" optional error={touched ? altError || null : null}>
          <Input
            id="customer-alt"
            type="tel"
            inputMode="numeric"
            value={form.altMobile}
            onChange={(event) =>
              setForm((current) => ({ ...current, altMobile: mobileOnly(event.target.value).slice(0, 10) }))
            }
            invalid={touched && Boolean(altError)}
          />
        </Field>
        <Field label="Address" htmlFor="customer-address" optional>
          <Textarea
            id="customer-address"
            value={form.address}
            onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
            className="min-h-[64px]"
          />
        </Field>
        <Field label="Notes" htmlFor="customer-notes" optional>
          <Textarea
            id="customer-notes"
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            className="min-h-[64px]"
          />
        </Field>
        <Button size="lg" className="w-full" loading={createCustomer.isPending} onClick={() => void save()}>
          Save Customer
        </Button>
      </div>
    </Sheet>
  );
}
