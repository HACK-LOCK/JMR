import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  /** Shows a small hint under the field. */
  hint?: string;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, invalid, hint, ...props }, ref) => (
    <div className="w-full">
      <input
        type={type}
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'flex h-12 w-full rounded-xl border-2 border-input bg-background px-4 py-2 text-base transition-colors',
          'placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary',
          'disabled:cursor-not-allowed disabled:opacity-60',
          invalid && 'border-destructive focus-visible:ring-destructive',
          className,
        )}
        {...props}
      />
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  ),
);
Input.displayName = 'Input';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      'flex min-h-[88px] w-full rounded-xl border-2 border-input bg-background px-4 py-3 text-base transition-colors',
      'placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary',
      'disabled:cursor-not-allowed disabled:opacity-60',
      invalid && 'border-destructive focus-visible:ring-destructive',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

/**
 * Opens the number pad the phone already has, for a field that takes a number.
 *
 * `type="tel"` is deliberately not used, even though it looks like the right
 * thing for a phone number. It tells the browser "telephone", so iOS shows the
 * full phone keypad - `*`, `#`, `+` and a letters toggle - and the browser then
 * ignores `inputMode` altogether. The result at the counter is somebody typing
 * a mobile number on an alphabet keyboard.
 *
 * `inputMode="numeric"` is what Android and current iOS read, and
 * `pattern="[0-9]*"` is the long standing iOS trigger for a digits only pad on
 * a plain text input. Together they give a keypad with just 0-9.
 *
 * This is only a hint to the operating system: the keypad is the one already on
 * the device, so it keeps the owner's own language, swipe and dictation habits.
 * No custom keypad is drawn, which is what a shop counter wants - the number has
 * to be typeable one handed, quickly, without a custom widget getting in the way.
 */
export const numberPad = {
  type: 'text',
  inputMode: 'numeric',
  pattern: '[0-9]*',
} as const;

export { Input, Textarea };
