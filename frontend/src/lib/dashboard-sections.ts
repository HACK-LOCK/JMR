import { useCallback, useSyncExternalStore } from 'react';

/**
 * The owner can put four billing figures away when customers are standing at
 * the counter, and bring them back with the shop PIN. New Bill and Search Order
 * are never hidden - there is nothing else to do without them.
 *
 * The PIN itself never reaches the browser: the server checks it, and all this
 * file remembers is which sections are currently put away.
 */
const KEY = 'jmmr.dashboard-hidden';

export const HIDDEN_SECTIONS = ['collection', 'bills', 'bench', 'due'] as const;
export type HiddenSection = (typeof HIDDEN_SECTIONS)[number];

function isSection(value: string): value is HiddenSection {
  return (HIDDEN_SECTIONS as readonly string[]).includes(value);
}

/** A stored value that no longer matches the current list is simply dropped. */
function readHidden(): Set<HiddenSection> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is HiddenSection => typeof value === 'string' && isSection(value)));
  } catch {
    return new Set();
  }
}

function writeHidden(sections: ReadonlySet<HiddenSection>): void {
  try {
    if (sections.size === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify([...sections]));
  } catch {
    /* private mode - the choice simply will not be remembered */
  }
}

/** The shell and the dashboard both read this, so it lives outside a component. */
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
 * useSyncExternalStore compares snapshots with Object.is, so handing back a
 * fresh Set on every call would look like a change on every render. The value
 * is therefore cached and only rebuilt when this tab actually writes.
 */
let cached: Set<HiddenSection> = new Set();
let cachedRaw: string | null = null;

function snapshot(): Set<HiddenSection> {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = readHidden();
  }
  return cached;
}

export interface DashboardVisibility {
  hidden: ReadonlySet<HiddenSection>;
  hide: (section: HiddenSection) => void;
  /** Asks for the shop PIN. The caller shows the prompt. */
  requestUnhide: () => void;
  /**
   * Called after the server accepted the PIN. Every section comes back at once,
   * so nobody has to walk the dashboard answering the same prompt four times.
   */
  revealAll: () => void;
}

export function useHiddenDashboardSections(onRequestUnhide: () => void): DashboardVisibility {
  const hidden = useSyncExternalStore(subscribe, snapshot, snapshot);

  const hide = useCallback((section: HiddenSection) => {
    const next = readHidden();
    next.add(section);
    writeHidden(next);
    emit();
  }, []);

  const revealAll = useCallback(() => {
    writeHidden(new Set());
    emit();
  }, []);

  return { hidden, hide, requestUnhide: onRequestUnhide, revealAll };
}
