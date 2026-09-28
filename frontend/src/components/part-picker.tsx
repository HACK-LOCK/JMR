import { useState } from 'react';
import { Check, Package, Search as SearchIcon } from 'lucide-react';
import { useDebounced } from '@/lib/hooks';
import { useParts } from '@/hooks/use-queries';
import { Sheet } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { LoadingBlock, EmptyState } from '@/components/ui/feedback';
import { ConsumeBadge } from '@/components/status-badge';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PartListItem } from '@/lib/types';

/**
 * Part chooser. Shows live stock next to every item and refuses to let the
 * employee add more than what is on the shelf.
 */
export function PartPicker({
  open,
  onOpenChange,
  onPick,
  title = 'Choose item from stock',
  excludeIds = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (part: PartListItem) => void;
  title?: string;
  excludeIds?: string[];
}): JSX.Element {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 250);
  const { data, isLoading } = useParts(debounced, false);
  const parts = (data ?? []).filter((part) => !excludeIds.includes(part.id));

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setQ('');
        onOpenChange(next);
      }}
      title={title}
      description="Items with zero stock are shown but cannot be added."
    >
      <div className="space-y-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="stock-item-search"
            name="stock-item-search"
            aria-label="Search items"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search item, brand or model"
            className="pl-11"
            autoFocus
          />
        </div>

        {isLoading && !data ? (
          <LoadingBlock label="Loading stock..." />
        ) : parts.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No items found"
            description="Add the item in Stock first, then it can be used on a repair."
          />
        ) : (
          <div className="space-y-2 pb-2">
            {parts.map((part) => {
              const outOfStock = part.quantity <= 0;
              return (
                <button
                  key={part.id}
                  type="button"
                  disabled={outOfStock}
                  onClick={() => {
                    onPick(part);
                    onOpenChange(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-xl border-2 p-3 text-left transition-colors',
                    outOfStock
                      ? 'cursor-not-allowed border-border bg-muted/40 opacity-70'
                      : 'border-border hover:border-primary hover:bg-primary/5',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold">{part.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[part.brand, part.model].filter(Boolean).join(' ') || part.category}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <ConsumeBadge mode={part.consumeMode} />
                      {part.supplierName ? (
                        <span className="text-2xs text-muted-foreground">{part.supplierName}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        'tabular text-base font-black',
                        outOfStock ? 'text-destructive' : part.low ? 'text-warning-foreground' : 'text-success',
                      )}
                    >
                      {part.quantity}
                    </p>
                    <p className="text-2xs text-muted-foreground">in stock</p>
                    {part.sellingPrice > 0 ? (
                      <p className="tabular mt-0.5 text-xs text-muted-foreground">
                        {money(part.sellingPrice)}
                      </p>
                    ) : null}
                  </div>
                  {outOfStock ? (
                    <span className="shrink-0 text-2xs font-bold uppercase text-destructive">Empty</span>
                  ) : (
                    <Check className="h-5 w-5 shrink-0 text-primary opacity-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
}
