import { Check } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { CustomerExportColumn } from '@shared/domain';
import { plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CustomerColumnChoice } from '@/lib/customer-columns';

/**
 * Ticking the fields of a customer that a downloaded file should carry.
 *
 * The chosen columns apply to both formats at once, so nobody has to answer
 * the same question twice for an Excel and a PDF of the same list. What is
 * ticked here is exactly what the file will contain - no extra column is ever
 * added behind the person's back, and none is silently dropped.
 */
export function CustomerColumnSheet({
  open,
  onOpenChange,
  choice,
  rowCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  choice: CustomerColumnChoice;
  /** How many customers the file will hold, shown so the size is not a surprise. */
  rowCount: number;
}): JSX.Element {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Download columns"
      description="Tick what the Excel and the PDF should contain. Nothing else is added."
      className="sm:max-w-lg"
    >
      <CustomerColumnBody choice={choice} rowCount={rowCount} onDone={() => onOpenChange(false)} />
    </Sheet>
  );
}

/**
 * The picker itself, without the sheet around it.
 *
 * A sheet renders through a portal, so this is the part that can be looked at
 * on its own - which is also what makes it obvious that everything the picker
 * shows comes from the shared column list and nothing is hard coded here.
 */
export function CustomerColumnBody({
  choice,
  rowCount,
  onDone,
}: {
  choice: CustomerColumnChoice;
  rowCount: number;
  onDone: () => void;
}): JSX.Element {
  const { all, selected, isSelected, toggle, selectOnly, selectAll } = choice;

  return (
    <div className="space-y-3 pb-2">
      <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-border bg-secondary/40 px-3 py-2">
        <p className="text-sm font-semibold">
          {selected.length} of {all.length} columns in the file
        </p>
        <Button variant="ghost" size="sm" onClick={selectAll} className="shrink-0">
          Select all
        </Button>
      </div>

      <ul className="space-y-1.5" role="group" aria-label="Columns to include in the download">
        {all.map((column) => (
          <li key={column.key}>
            <ColumnRow
              column={column}
              on={isSelected(column.key)}
              onToggle={() => toggle(column.key)}
              onOnly={() => selectOnly(column.key)}
            />
          </li>
        ))}
      </ul>

      <p className="text-2xs text-muted-foreground">
        {rowCount > 0
          ? `The next download holds ${plural(rowCount, 'customer')} in ${plural(selected.length, 'column')}. Your choice is remembered for next time.`
          : 'Your choice is remembered for next time.'}
      </p>

      <Button className="w-full" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

/** One tick box. Tapping the box ticks it; tapping "Only" leaves just this one. */
function ColumnRow({
  column,
  on,
  onToggle,
  onOnly,
}: {
  column: CustomerExportColumn;
  on: boolean;
  onToggle: () => void;
  onOnly: () => void;
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex min-h-[56px] items-center gap-1 rounded-xl border-2 px-2 py-1.5 transition-colors',
        on ? 'border-primary/40 bg-primary/5' : 'border-border bg-background',
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        aria-label={column.header}
        onClick={onToggle}
        className="flex min-h-[48px] min-w-0 flex-1 items-center gap-3 rounded-lg px-1 text-left"
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2',
            on ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background',
          )}
        >
          {on ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
        </span>
        <span className={cn('min-w-0 truncate text-base', on ? 'font-bold' : 'font-medium')}>
          {column.header}
        </span>
      </button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onOnly}
        aria-label={`Select only ${column.header}`}
        className="shrink-0"
      >
        Only
      </Button>
    </div>
  );
}
