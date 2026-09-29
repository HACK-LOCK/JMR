import { useMemo, useState } from 'react';
import { List } from 'lucide-react';
import { SuggestionField, matchesHint } from '@/components/suggestion-field';
import { ModelPickerSheet } from '@/components/model-picker-sheet';
import { mergeBrands, mergeModels } from '@/components/device-hints';
import { useDeviceHints } from '@/hooks/use-queries';

/**
 * Brand and model, offered from the models sold in this market.
 *
 * Two sources, and the order matters. What this shop has actually repaired goes
 * first, because that is the spelling a search for last month's bill will match.
 * The wider catalogue follows, so a model that has never come through the door
 * before is still one tap away instead of being typed letter by letter.
 *
 * The list is fetched once and filtered here rather than per keystroke, so
 * typing a model name never waits on a round trip.
 *
 * Free typing is never blocked. This is a typing aid, not a whitelist: a laptop,
 * a tablet, a brand that launched after the list was written, or a rare variant
 * code all still get typed in full.
 */

const OWN_DETAIL = 'used on a bill here';

/** Brands this shop has repaired, then every brand sold in this market. */
export function BrandField({
  id,
  value,
  onChange,
  invalid,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  invalid?: boolean;
  placeholder?: string;
}): JSX.Element {
  const { data } = useDeviceHints();
  const query = value.trim();

  const suggestions = useMemo(() => {
    const shopBrands = data?.brands ?? [];
    const brands = mergeBrands(shopBrands).map((brand) => ({
      label: brand,
      detail: shopBrands.some((item) => item.toLowerCase() === brand.toLowerCase())
        ? 'repaired here before'
        : undefined,
    }));
    return query ? brands.filter((brand) => matchesHint(brand.label, query)) : brands;
  }, [data, query]);

  return (
    <SuggestionField
      id={id}
      value={value}
      onChange={onChange}
      suggestions={suggestions}
      placeholder={placeholder}
      invalid={invalid}
      header={query ? undefined : 'Brands — the ones this shop has used come first'}
      footer={query && suggestions.length === 0 ? 'Not a brand we know — type it anyway.' : undefined}
    />
  );
}

/**
 * Models, narrowed to the chosen brand so "M30" does not also offer a laptop
 * called M30, and so changing brand swaps the list for that brand's models.
 *
 * Two ways in, because there are two situations. Typing is for a counter who
 * knows the phone; the list button opens the whole catalogue for a counter who
 * does not, which on a phone means the list gets the screen rather than a
 * 256-pixel strip under the field.
 */
export function ModelField({
  id,
  value,
  onChange,
  brand,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  brand: string;
  placeholder?: string;
}): JSX.Element {
  const { data } = useDeviceHints();
  const [browsing, setBrowsing] = useState(false);
  const query = value.trim();
  const chosen = brand.trim();

  const shopModels = useMemo(() => data?.models ?? [], [data]);

  const suggestions = useMemo(() => {
    if (!chosen) {
      // No brand yet: the full catalogue is far too long to be useful here, so
      // only the shop's own models are offered, tagged with their brand.
      return shopModels
        .filter((model) => !query || matchesHint(model.label, query))
        .map((model) => ({ label: model.label, detail: model.brand }));
    }

    const merged = mergeModels(shopModels, chosen, OWN_DETAIL);
    return query ? merged.filter((model) => matchesHint(model.label, query)) : merged;
  }, [chosen, query, shopModels]);

  return (
    <>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <SuggestionField
            id={id}
            value={value}
            onChange={onChange}
            suggestions={suggestions}
            placeholder={placeholder}
            header={
              query
                ? undefined
                : chosen
                  ? `${chosen} models — the ones used here come first`
                  : 'Models used on bills here — pick a brand to see the full list'
            }
            footer={
              !chosen
                ? 'Pick a brand above to see every model sold under it.'
                : query && suggestions.length === 0
                  ? `Not one we know for ${chosen} — type it anyway.`
                  : undefined
            }
          />
        </div>
        <button
          type="button"
          onClick={() => setBrowsing(true)}
          aria-label={`Browse all ${chosen || ''} models`.replace('  ', ' ')}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-input bg-background text-muted-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <List className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <ModelPickerSheet
        open={browsing}
        onOpenChange={setBrowsing}
        brand={brand}
        shopModels={shopModels}
        onPick={onChange}
      />
    </>
  );
}
