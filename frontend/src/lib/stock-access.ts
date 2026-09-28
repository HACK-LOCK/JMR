import { useCallback, useSyncExternalStore } from 'react';

/**
 * The Stock area sits behind its own PIN so nobody opens stock numbers by
 * accident while doing billing work. The PIN itself never reaches the browser:
 * it is checked by the server, and all this file keeps is the fact that the
 * unlock succeeded and when.
 */
const STOCK_KEY = 'jmmr.stock-unlocked-at';
/** Fallback window, used until the server tells us the real one. */
const DEFAULT_TTL_MINUTES = 120;

function readUnlockedAt(): number {
  try {
    const raw = localStorage.getItem(STOCK_KEY);
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeUnlockedAt(at: number): void {
  try {
    if (at > 0) localStorage.setItem(STOCK_KEY, String(at));
    else localStorage.removeItem(STOCK_KEY);
  } catch {
    /* private mode - the unlock simply will not be remembered */
  }
}

export function isStockUnlocked(ttlMinutes = DEFAULT_TTL_MINUTES): boolean {
  const at = readUnlockedAt();
  if (at <= 0) return false;
  const ageMinutes = (Date.now() - at) / 60_000;
  if (ageMinutes > ttlMinutes) {
    writeUnlockedAt(0);
    return false;
  }
  return true;
}

export function markStockUnlocked(ttlMinutes = DEFAULT_TTL_MINUTES): void {
  writeUnlockedAt(Date.now());
  // Nothing to store beyond "now" - the window is computed from it.
  void ttlMinutes;
}

export function clearStockUnlock(): void {
  writeUnlockedAt(0);
}

/*
 * The shell and the stock screen both need to know, so the state lives here
 * instead of inside one component. Every reader in this tab hears about a
 * change immediately.
 */
const listeners = new Set<() => void>();

/**
 * Starts from what is already stored. Starting at false made a still-valid
 * unlock ask for the PIN again after every reload, which read as "stock is
 * broken" to anyone who refreshed the page mid-shift.
 */
let cached = isStockUnlocked();

function refresh(): boolean {
  cached = isStockUnlocked();
  return cached;
}

function emit(): void {
  refresh();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent): void => {
    if (event.key === STOCK_KEY || event.key === null) emit();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function snapshot(): boolean {
  // Re-read instead of trusting the cache: the window can expire while the
  // page is open, and another tab can lock stock without this one hearing a
  // storage event on some platforms.
  return refresh();
}

export interface StockAccess {
  unlocked: boolean;
  /** Called after the server accepted the PIN. */
  unlock: (ttlMinutes?: number) => void;
  /** Called when the person taps "Lock stock" or signs out. */
  lock: () => void;
}

/** Read by the app shell and the stock screen. */
export function useStockAccess(): StockAccess {
  const unlocked = useSyncExternalStore(subscribe, snapshot, snapshot);

  const unlock = useCallback((ttlMinutes = DEFAULT_TTL_MINUTES) => {
    markStockUnlocked(ttlMinutes);
    emit();
  }, []);

  const lock = useCallback(() => {
    clearStockUnlock();
    emit();
  }, []);

  return { unlocked, unlock, lock };
}
