import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Option {
  value: string;
  label: string;
  description?: string;
}

/**
 * Large-tap friendly select. A native <select> on Android is hard to use
 * with one hand, so this is a real list of big buttons.
 */
export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Select',
  disabled,
  invalid,
  className,
  allowEmpty = false,
  emptyLabel = 'None',
  id,
  'aria-label': ariaLabel,
}: {
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  /** Lets a <label for> point at this control. */
  id?: string;
  'aria-label'?: string;
}): JSX.Element {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex min-h-[48px] w-full items-center justify-between gap-2 rounded-xl border-2 border-input bg-background px-4 py-2 text-left text-base transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
          invalid && 'border-destructive',
          !value && 'text-muted-foreground',
        )}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close list"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="listbox"
            className="absolute z-50 mt-1.5 max-h-72 w-full overflow-y-auto overscroll-contain rounded-xl border-2 bg-background p-1.5 shadow-xl"
          >
            {allowEmpty ? (
              <OptionRow
                option={{ value: '', label: emptyLabel }}
                active={!value}
                onPick={() => {
                  onValueChange('');
                  setOpen(false);
                }}
              />
            ) : null}
            {options.map((option) => (
              <OptionRow
                key={option.value}
                option={option}
                active={option.value === value}
                onPick={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function OptionRow({
  option,
  active,
  onPick,
}: {
  option: Option;
  active: boolean;
  onPick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onPick}
      className={cn(
        'flex min-h-[48px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-base transition-colors',
        active ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-secondary',
      )}
    >
      <span className="min-w-0">
        <span className="block truncate">{option.label}</span>
        {option.description ? (
          <span className="block truncate text-xs text-muted-foreground">{option.description}</span>
        ) : null}
      </span>
      {active ? <Check className="h-5 w-5 shrink-0 text-primary" /> : null}
    </button>
  );
}
