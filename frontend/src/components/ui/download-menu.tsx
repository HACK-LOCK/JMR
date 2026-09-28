import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, Loader2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DownloadOption<T extends string = string> {
  /** What the caller calls this file, e.g. `pdf` or `xlsx`. */
  id: T;
  label: string;
  /** One short line under the label, so the rows say what the file is for. */
  description?: string;
  icon: LucideIcon;
}

/**
 * One download button that holds every file format, instead of one button per
 * format. The page header has a fixed height, so a screen that gains a file
 * format should not push the buttons beside it wider or onto a second row -
 * the format goes inside the menu and the header stays the same size.
 *
 * The panel is anchored to the right edge of the trigger by default, which is
 * where the header puts it, so it opens back over the page rather than off the
 * side of it. Rows are full size tap targets, like every other control here.
 */
export function DownloadMenu<T extends string>({
  options,
  onPick,
  label = 'Download',
  disabled = false,
  /** True while a file is being written, so the trigger shows the spinner. */
  busy = false,
  busyText = 'Preparing',
  align = 'right',
  className,
}: {
  options: DownloadOption<T>[];
  onPick: (id: T) => void;
  label?: string;
  disabled?: boolean;
  busy?: boolean;
  busyText?: string;
  align?: 'left' | 'right';
  className?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);

  // The panel floats over the page rather than behind a full screen overlay, so
  // the tap outside it has to be caught by hand.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      if (blockRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={blockRef} className={cn('relative', className)}>
      <Button
        className="gap-2"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={busy}
        aria-label={busy ? `${label}, ${busyText}` : label}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        ) : (
          <Download className="h-5 w-5" />
        )}
        <span className="hidden sm:inline">{busy ? busyText : label}</span>
        {busy ? null : <ChevronDown className="hidden h-4 w-4 opacity-70 sm:block" />}
      </Button>

      {open ? (
        <div
          role="menu"
          aria-label={label}
          className={cn(
            'absolute z-50 mt-1.5 w-max min-w-[13rem] max-w-[calc(100vw-1.5rem)]',
            'overflow-hidden rounded-xl border-2 bg-card p-1.5 shadow-xl',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {options.map((option) => (
            <DownloadRow
              key={option.id}
              option={option}
              onClick={() => {
                setOpen(false);
                onPick(option.id);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DownloadRow<T extends string>({
  option,
  onClick,
}: {
  option: DownloadOption<T>;
  onClick: () => void;
}): JSX.Element {
  const Icon = option.icon;
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex min-h-[48px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-secondary active:bg-secondary"
    >
      <Icon className="h-5 w-5 shrink-0 text-primary" />
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold">{option.label}</span>
        {option.description ? (
          <span className="block truncate text-xs text-muted-foreground">{option.description}</span>
        ) : null}
      </span>
    </button>
  );
}
