import { useCallback, useSyncExternalStore } from 'react';

/**
 * The owner can put four billing figures away when customers are standing at
 * the counter, and bring them back with the owner PIN. New Bill and Search Order
 * are never hidden - there is nothing else to do without them.
 *
 * Everything starts put away: nothing on disk means nothing was decided yet,
 * and the safe answer then is to keep the figures off the screen. A person who
 * brings them back with the PIN stores an explicit empty list, which is the one
 * state that survives a reload without re-asking.
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

/**
 * A stored value that no longer matches the current list is simply dropped.
 * Nothing stored means nothing was decided yet, and the safe answer then is to
 * keep every figure off the screen.
 */
function readHidden(): Set<HiddenSection> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set(HIDDEN_SECTIONS);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set(HIDDEN_SECTIONS);
    return new Set(parsed.filter((value): value is HiddenSection => typeof value === 'string' && isSection(value)));
  } catch {
    return new Set(HIDDEN_SECTIONS);
  }
}

function writeHidden(sections: ReadonlySet<HiddenSection>): void {
  try {
    // Always stored, even when empty: the absence of the key means "never
    // decided", which reads as everything hidden, so a revealed dashboard has to
    // write an empty list or it would be hidden again by the default above.
    localStorage.setItem(KEY, JSON.stringify([...sections]));
  } catch {
    /* private mode - the choice simply will not be remembered */
  }
}

/**
 * Signs in with everything put away, whatever the previous session decided.
 * The owner brings the figures back with the PIN when they need them, so a
 * fresh sign-in never starts with the day's money on show.
 */
export function hideAllDashboardSections(): void {
  writeHidden(new Set(HIDDEN_SECTIONS));
  emit();
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
  /** Asks for the owner PIN. The caller shows the prompt. */
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
