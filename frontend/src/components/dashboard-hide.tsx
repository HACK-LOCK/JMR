import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Sheet } from '@/components/ui/sheet';
import { useVerifyShopPin } from '@/hooks/use-queries';
import { cn } from '@/lib/utils';
import type { DashboardVisibility, HiddenSection } from '@/lib/dashboard-sections';

/**
 * The eye that sits on a dashboard section. One tap puts the section away, and
 * one tap on a hidden section asks for the shop PIN. The PIN is checked by the
 * server and is never shown, stored or hinted at anywhere in the app.
 */
export function SectionEye({
  section,
  label,
  vis,
  className,
}: {
  section: HiddenSection;
  label: string;
  vis: DashboardVisibility;
  className?: string;
}): JSX.Element {
  const hidden = vis.hidden.has(section);
  return (
    <button
      type="button"
      onClick={() => (hidden ? vis.requestUnhide() : vis.hide(section))}
      aria-label={hidden ? `Show ${label}` : `Hide ${label}`}
      title={hidden ? `Show ${label}` : `Hide ${label}`}
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-secondary',
        className,
      )}
    >
      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

/**
 * The one way back, shown while anything on the dashboard is put away.
 *
 * Every hidden figure comes back together after one correct PIN, so a busy
 * counter is not made to answer the same question four times. There is a single
 * icon and no sentence: the figures were hidden on purpose, and the way to see
 * them again should be as quiet as hiding them was. The count lives in the
 * label a screen reader announces and in the long-press tooltip, not on the
 * screen.
 */
export function HiddenSectionsButton({
  count,
  vis,
  className,
}: {
  count: number;
  vis: DashboardVisibility;
  className?: string;
}): JSX.Element {
  const label = count === 1 ? 'Show the hidden figure' : `Show all ${count} hidden figures`;
  return (
    <button
      type="button"
      onClick={() => vis.requestUnhide()}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary active:bg-secondary',
        className,
      )}
    >
      <EyeOff className="h-4 w-4" />
    </button>
  );
}

/**
 * The one prompt. One correct PIN brings back every hidden section, so a busy
 * counter is not made to answer the same question four times. A wrong PIN
 * leaves everything exactly as it was.
 */
export function UnhideSheet({
  open,
  onOpenChange,
  onUnlocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlocked: () => void;
}): JSX.Element {
  const verify = useVerifyShopPin();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!pin.trim()) {
      setError('Enter the PIN.');
      return;
    }
    try {
      await verify.mutateAsync(pin.trim());
      setPin('');
      onUnlocked();
      onOpenChange(false);
    } catch (caught) {
      setPin('');
      const message = caught instanceof Error ? caught.message : '';
      // The tap-through cool-down is worth reading; a wrong PIN is not.
      setError(message.startsWith('Too many') ? message : 'Incorrect PIN');
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPin('');
          setError(null);
        }
        onOpenChange(next);
      }}
      title="Enter owner PIN"
      description="The hidden figures come back once the PIN is correct."
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-3 pb-2">
        <Field label="PIN" htmlFor="unhide-pin" error={error}>
          <Input
            id="unhide-pin"
            name="unhide-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            // Digits only, and it stays masked - see the note in stock-gate.tsx
            // about why numberPad is not spread into a password field.
            pattern="[0-9]*"
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 12))}
            placeholder="Enter PIN"
            invalid={Boolean(error)}
            className="tabular h-14 text-center text-xl tracking-[0.2em]"
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full gap-2"
          loading={verify.isPending}
          loadingText="Checking..."
        >
          <Lock className="h-5 w-5" /> Show hidden sections
        </Button>
      </form>
    </Sheet>
  );
}
