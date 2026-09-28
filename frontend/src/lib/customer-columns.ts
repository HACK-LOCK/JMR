import { useCallback, useSyncExternalStore } from 'react';
import {
  allCustomerExportColumns,
  isCustomerExportKey,
  type CustomerExportColumn,
  type CustomerExportKey,
} from '@shared/domain';

/**
 * Which fields of a customer end up in a downloaded file.
 *
 * The person at the counter often wants a phone list and nothing else, so the
 * choice is theirs: tick a column, and the Excel and the PDF both come out with
 * that column and no other. The choice is remembered between visits, because
 * somebody who only ever wants a phone list should not have to retick it every
 * morning.
 *
 * The list of possible columns lives in the shared domain file, the same one the
 * server builds its files from, so the picker can never offer a column the
 * exporter does not know how to write.
 */
const KEY = 'jmmr.customer-export-columns';

/** A stored value that no longer matches the current list is simply dropped. */
function readKeys(): Set<CustomerExportKey> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((value): value is CustomerExportKey => typeof value === 'string' && isCustomerExportKey(value)),
    );
  } catch {
    return new Set();
  }
}

function writeKeys(keys: ReadonlySet<CustomerExportKey>): void {
  try {
    // Nothing chosen means the default, so the setting is removed rather than
    // written down - otherwise turning every column back on would be a thing
    // that looks saved but is not.
    if (keys.size === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify([...keys]));
  } catch {
    /* private mode - the choice simply will not be remembered */
  }
}

/** The store lives outside a component so the picker and the buttons agree. */
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent): void => {
    if (event.key === KEY || event.key === null) emit();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * useSyncExternalStore compares snapshots with Object.is, so a fresh Set on
 * every call would look like a change on every render. The value is therefore
 * cached and only rebuilt when this tab actually writes.
 */
let cached: Set<CustomerExportKey> = new Set();
let cachedRaw: string | null = null;

function snapshot(): Set<CustomerExportKey> {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = readKeys();
  }
  return cached;
}

export interface CustomerColumnChoice {
  /** Every column, so the picker can draw all of them ticked or unticked. */
  all: readonly CustomerExportColumn[];
  /** The ticked ones, in list order, which is the order a file will have. */
  selected: CustomerExportColumn[];
  /** The query value both download buttons send, e.g. `cols=name,mobile`. */
  query: string;
  /** True once a real choice has been saved, so a button can say so. */
  narrowed: boolean;
  isSelected: (key: CustomerExportKey) => boolean;
  toggle: (key: CustomerExportKey) => void;
  selectOnly: (key: CustomerExportKey) => void;
  selectAll: () => void;
}

export function useCustomerExportColumns(): CustomerColumnChoice {
  const keys = useSyncExternalStore(subscribe, snapshot, snapshot);
  const all = allCustomerExportColumns();

  const toggle = useCallback((key: CustomerExportKey) => {
    const next = readKeys();
    if (next.has(key)) {
      // Ticking the last column off would leave nothing to download, and a
      // person tapping a box off did not mean to empty the file.
      if (next.size === 1) return;
      next.delete(key);
    } else {
      next.add(key);
    }
    writeKeys(next);
    emit();
  }, []);

  const selectOnly = useCallback((key: CustomerExportKey) => {
    writeKeys(new Set([key]));
    emit();
  }, []);

  const selectAll = useCallback(() => {
    writeKeys(new Set());
    emit();
  }, []);

  // A person who saved nothing gets every column, which is what this download
  // has always produced, so nobody opens the app to a surprise file.
  const chosen = keys.size > 0 ? all.filter((column) => keys.has(column.key)) : all;
  const selected = chosen.length > 0 ? chosen : all;

  return {
    all,
    selected,
    query: selected.map((column) => column.key).join(','),
    narrowed: keys.size > 0 && keys.size < all.length,
    isSelected: (key) => keys.size === 0 || keys.has(key),
    toggle,
    selectOnly,
    selectAll,
  };
}
