import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('text-sm font-semibold text-foreground/80 leading-none', className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

/**
 * Label + control + optional "optional" marker + error, in one block.
 * Keeps every form in the app looking and behaving the same.
 *
 * When `htmlFor` is given, the id is also pushed onto the control itself, so a
 * label can never end up pointing at nothing. Several of our controls (the
 * custom Select, for one) do not render a real <input>, and silently dropping
 * the link breaks browser autofill and screen readers.
 */
export function Field({
  label,
  htmlFor,
  optional,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  optional?: boolean;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  const linked = React.useMemo(() => {
    if (!htmlFor) return { id: undefined, control: children };
    const only = React.Children.count(children) === 1 ? React.Children.only(children) : null;
    if (!React.isValidElement<{ id?: string }>(only)) {
      return { id: htmlFor, control: children };
    }
    // An id the caller set deliberately wins - but the label has to follow it,
    // otherwise for= and id= disagree and the pairing breaks again.
    if (only.props.id) return { id: only.props.id, control: children };
    return { id: htmlFor, control: React.cloneElement(only, { id: htmlFor }) };
  }, [children, htmlFor]);

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={linked.id}>{label}</Label>
        {optional ? <span className="text-2xs text-muted-foreground">Optional</span> : null}
      </div>
      {linked.control}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export { Label };
