import { DEVICE_CATALOG_BRANDS, catalogModelsFor } from '@shared/catalog';
import type { Suggestion } from '@/components/suggestion-field';

/**
 * Joining what the shop has actually repaired with the wider model catalogue.
 *
 * Two places need this answer - the dropdown under the model field, and the
 * full sheet you browse - so it lives here rather than in either one. If the
 * order ever changes, both change together.
 */

/** A model this shop has written on a bill, with the brand it was written under. */
export interface ShopModel {
  label: string;
  brand: string;
}

/** Brands this shop has repaired first, then every brand sold in this market. */
export function mergeBrands(fromShop: string[]): string[] {
  // A shop that has written both "samsung" and "Samsung" must still get one
  // Samsung in the list, not two identical groups of models under two spellings.
  // The first one wins, because that is the one already on the old bills.
  const seen = new Set<string>();
  const mine: string[] = [];
  for (const brand of fromShop) {
    const key = brand.toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      mine.push(brand);
    }
  }

  const rest = DEVICE_CATALOG_BRANDS.filter((brand) => !seen.has(brand.toLowerCase()));
  return [...mine, ...rest];
}

/**
 * Models under one brand: the shop's own first, then the catalogue.
 *
 * The shop's spelling wins a clash. If ten bills here say "m30", that is what a
 * search for last month's job has to match, so it must be the name that comes
 * first, not the catalogue's tidier "Galaxy M30".
 */
export function mergeModels(shop: ShopModel[], brand: string, ownDetail: string): Suggestion[] {
  const wanted = brand.trim().toLowerCase();
  if (!wanted) return [];

  const out: Suggestion[] = shop
    .filter((model) => model.brand.trim().toLowerCase() === wanted)
    .map((model) => ({ label: model.label, detail: ownDetail }));

  const seen = new Set(out.map((suggestion) => suggestion.label.toLowerCase()));
  for (const label of catalogModelsFor(brand)) {
    if (!seen.has(label.toLowerCase())) {
      out.push({ label });
      seen.add(label.toLowerCase());
    }
  }
  return out;
}

/**
 * Every brand's models, for browsing with no brand chosen yet. Brand order is
 * the same as the brand field's, so the two read identically.
 */
export function modelGroupsByBrand(
  shop: ShopModel[],
  ownDetail: string,
): { brand: string; suggestions: Suggestion[] }[] {
  return mergeBrands(shop.map((model) => model.brand))
    .map((brand) => ({ brand, suggestions: mergeModels(shop, brand, ownDetail) }))
    .filter((group) => group.suggestions.length > 0);
}
