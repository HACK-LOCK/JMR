import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { matchesHint } from '@/components/suggestion-field';
import { mergeModels, modelGroupsByBrand, type ShopModel } from '@/components/device-hints';

/**
 * The whole model list, on one scrollable sheet.
 *
 * The dropdown under the field is for when the counter knows roughly what the
 * phone is. This is for when they do not - a customer hands over a phone with
 * no box, or asks for "the Samsung they had last time". Scrolling a list beats
 * guessing at spelling, and on a phone the list gets the whole screen instead of
 * 256 pixels of it.
 *
 * Models this shop has used are split out under their own heading, because a
 * name that has to be searched for again later deserves to be the easiest one to
 * write down now.
 */

const OWN_DETAIL = 'used on a bill here';
const OWN_HEADING = 'Used on bills here';

/** One row. Big enough to hit with a thumb at a counter, which is the point. */
function ModelRow({
  label,
  detail,
  onPick,
}: {
  label: string;
  detail?: string;
  onPick: (label: string) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onPick(label)}
      className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-base transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold">{label}</span>
        {detail ? <span className="block truncate text-xs text-muted-foreground">{detail}</span> : null}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

function Section({
  heading,
  items,
  onPick,
  highlight,
}: {
  heading: string;
  items: { label: string; detail?: string }[];
  onPick: (label: string) => void;
  highlight?: boolean;
}): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <section>
      <h3
        className={
          highlight
            ? 'sticky top-[3.75rem] z-10 bg-background/95 px-1 py-1.5 text-2xs font-bold uppercase tracking-wide text-primary backdrop-blur'
            : 'px-1 py-1.5 text-2xs font-bold uppercase tracking-wide text-muted-foreground'
        }
      >
        {heading}
      </h3>
      <div className="space-y-0.5">
        {items.map((item) => (
          <ModelRow key={item.label} label={item.label} detail={item.detail} onPick={onPick} />
        ))}
      </div>
    </section>
  );
}

export function ModelPickerSheet({
  open,
  onOpenChange,
  brand,
  shopModels,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chosen brand, or empty to browse every brand. */
  brand: string;
  shopModels: ShopModel[];
  onPick: (label: string) => void;
}): JSX.Element {
  const [query, setQuery] = useState('');

  // Reopening with yesterday's filter still in it would look like a broken list.
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const chosen = brand.trim();

  // With a brand chosen, only that brand is listed. Without one, every brand is
  // listed under its own heading, because a customer rarely knows the brand
  // before they know the model.
  const groups = useMemo(() => {
    const source = chosen
      ? [{ brand: chosen, suggestions: mergeModels(shopModels, chosen, OWN_DETAIL) }]
      : modelGroupsByBrand(shopModels, OWN_DETAIL);

    const needle = query.trim();
    if (!needle) return source;

    return source
      .map((group) => ({
        brand: group.brand,
        suggestions: group.suggestions.filter((item) => matchesHint(item.label, needle)),
      }))
      .filter((group) => group.suggestions.length > 0);
  }, [brand, query, shopModels]);

  const total = groups.reduce((sum, group) => sum + group.suggestions.length, 0);

  function pick(label: string): void {
    onPick(label);
    onOpenChange(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={chosen ? `${chosen} models` : 'Choose a model'}
      description={
        query
          ? `${total} ${total === 1 ? 'match' : 'matches'}`
          : chosen
            ? 'Models used here come first. Type above to narrow it down.'
            : 'Models used here come first, under their brand.'
      }
    >
      <div className="sticky top-0 z-20 -mx-5 bg-background px-5 pb-2 pt-1">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search models"
            autoComplete="off"
            className="pl-11"
            aria-label="Search models"
          />
        </div>
      </div>

      {total === 0 ? (
        <p className="px-1 py-6 text-sm text-muted-foreground">
          Nothing here matches “{query.trim()}”. Close this and type it into the field instead — whatever the
          customer says can be written in full.
        </p>
      ) : (
        <div className="space-y-4 pb-4">
          {groups.map((group) => {
            const own = group.suggestions.filter((item) => item.detail === OWN_DETAIL);
            const rest = group.suggestions.filter((item) => item.detail !== OWN_DETAIL);
            return (
              <div key={group.brand} className="space-y-3">
                <Section heading={OWN_HEADING} items={own} onPick={pick} highlight />
                <Section
                  heading={chosen ? `${group.brand} — ${rest.length} models` : group.brand}
                  items={rest}
                  onPick={pick}
                />
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
