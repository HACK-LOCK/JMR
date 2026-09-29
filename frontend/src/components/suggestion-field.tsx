import { useEffect, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * A text field that offers things the shop already uses, as you type.
 *
 * The counter writes the same handful of things many times a day, and however
 * they were spelled that day is what ends up in the history and on the printed
 * bill. Suggesting the shop's own wording is what makes that list findable
 * later - "CC point dead", "cc change" and "Charging Socket (CC) Change" are
 * one fault and only one of them can be searched for.
 *
 * Free typing is never blocked. Whatever a customer actually says is kept word
 * for word; the suggestions are a shortcut, not a gate.
 *
 * Which list to offer is left to the caller, because the problem field offers a
 * fixed set of faults while brand and model offer whatever this shop has
 * repaired, and narrowing those is the caller's business.
 */

export interface Suggestion {
  label: string;
  /** A second line under the label, e.g. which brand a model belongs to. */
  detail?: string;
  /**
   * Picking this keeps whatever was typed rather than replacing it with the
   * label. Used for the "Other Problem" fallback, where the customer's own
   * words are the useful part.
   */
  keepsTyped?: boolean;
  /** Matches nothing the shop has used, so it is the fallback. */
  fallback?: boolean;
}

export function SuggestionField({
  id,
  value,
  onChange,
  suggestions,
  placeholder,
  invalid,
  /** Shown above the list when nothing has been typed yet. */
  header,
  /** Shown under the list while typing, so "no match" never looks broken. */
  footer,
  /** Called on blur with the label the field should settle on, if any. */
  settleOn,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  suggestions: Suggestion[];
  placeholder?: string;
  invalid?: boolean;
  header?: string;
  footer?: string;
  settleOn?: string | undefined;
  autoFocus?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = `${id}-suggestions`;

  useEffect(() => {
    setActive(0);
  }, [value]);

  // Some lists are long - Samsung alone runs to over a hundred models - and the
  // keyboard highlight is invisible once it walks past the edge of the box.
  // "nearest" scrolls the minimum needed, so the list does not jump about.
  useEffect(() => {
    if (!open || active < 0) return;
    list.current
      ?.querySelector(`#${CSS.escape(`${id}-opt-${active}`)}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active, id, open]);

  // A tap anywhere else means the employee has moved on, so the list goes away.
  useEffect(() => {
    if (!open) return undefined;
    const away = (event: MouseEvent): void => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const choose = (suggestion: Suggestion): void => {
    onChange(suggestion.keepsTyped && value.trim() ? value.trim() : suggestion.label);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (suggestions.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === 'Enter') {
      // Only intercept Enter when there is genuinely something to take, so the
      // form still submits normally the rest of the time.
      if (open && suggestions[active]) {
        event.preventDefault();
        choose(suggestions[active]);
      }
      return;
    }
    if (event.key === 'Escape') setOpen(false);
  };

  return (
    <div className="relative" ref={root}>
      <Input
        id={id}
        name={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && suggestions[active] ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        invalid={invalid}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        // A known thing spelled slightly differently settles into the shop's own
        // wording, so the shop's words are never rewritten behind the employee.
        onBlur={() => {
          if (settleOn !== undefined && settleOn !== value.trim()) onChange(settleOn);
        }}
      />

      {open && suggestions.length > 0 ? (
        <div
          ref={list}
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto overscroll-contain rounded-xl border-2 border-border bg-background p-1 shadow-lg"
        >
          {header ? (
            <p className="px-3 py-1.5 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
              {header}
            </p>
          ) : null}

          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.label}
              id={`${id}-opt-${index}`}
              type="button"
              role="option"
              aria-selected={index === active}
              onMouseEnter={() => setActive(index)}
              // Keeps the input focused so blur does not settle mid-click.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(suggestion)}
              className={cn(
                'flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                index === active ? 'bg-primary/10 font-bold text-primary' : 'hover:bg-secondary',
              )}
            >
              <span className="min-w-0">
                <span className="block truncate">{suggestion.label}</span>
                {suggestion.detail ? (
                  <span className="block truncate text-2xs font-normal text-muted-foreground">
                    {suggestion.detail}
                  </span>
                ) : null}
              </span>
              {index === active ? <Check className="h-4 w-4 shrink-0" /> : null}
            </button>
          ))}

          {footer ? (
            <p className="flex items-center gap-1.5 px-3 py-2 text-2xs text-muted-foreground">
              <Search className="h-3 w-3 shrink-0" />
              {footer}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Loose match: "cc" and "CC" and "charging socket" all find the same entry.
 *
 * Deliberately not fuzzy. A repair counter types quickly and wants the obvious
 * hit; a fuzzy match that jumps to "Coolpad" while they meant "Charging" is
 * worse than no suggestion at all.
 */
export function matchesHint(haystack: string, needle: string): boolean {
  return fold(haystack).includes(fold(needle));
}

function fold(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}
