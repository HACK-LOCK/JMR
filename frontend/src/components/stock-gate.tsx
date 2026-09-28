import { useState, type FormEvent } from 'react';
import { ArrowLeft, Lock, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { useStockUnlock } from '@/hooks/use-queries';
import { useAuth } from '@/lib/auth';
import { useStockAccess } from '@/lib/stock-access';
import { cn } from '@/lib/utils';

/**
 * The Stock lock screen. It asks for the shop's stock PIN on top of the normal
 * sign in, so billing work never opens stock numbers by accident. The PIN is
 * checked by the server - this screen only sends it and waits for the answer.
 */
export function StockGate(): JSX.Element {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { unlock } = useStockAccess();
  const stockUnlock = useStockUnlock();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!pin.trim()) {
      setError('Enter the stock PIN.');
      return;
    }
    try {
      const response = await stockUnlock.mutateAsync(pin.trim());
      unlock(response.data.expiresInMinutes);
      setPin('');
    } catch (caught) {
      setPin('');
      setError(caught instanceof Error ? caught.message : 'Wrong PIN.');
    }
  };

  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-success text-success-foreground shadow-lg">
            <Package className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-black leading-tight">JMR &mdash; STOCK</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the stock PIN to open items and suppliers.
          </p>
        </div>

        <form
          onSubmit={(event) => void submit(event)}
          className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm"
        >
          <Field label="Stock PIN" htmlFor="stock-pin" error={error}>
            <Input
              id="stock-pin"
              name="stock-pin"
              type="password"
              autoComplete="off"
              autoFocus
              value={pin}
              // Letters are allowed on purpose: if the shop has not set its own
              // PIN, the server also accepts the person's account password,
              // and a numeric-only box would make that impossible to type.
              onChange={(event) => setPin(event.target.value.replace(/\s/g, '').slice(0, 20))}
              placeholder="Enter PIN"
              invalid={Boolean(error)}
              className={cn('h-14 text-center text-xl tracking-[0.2em]', 'tabular')}
            />
          </Field>

          <Button
            type="submit"
            size="lg"
            variant="success"
            className="w-full gap-2"
            loading={stockUnlock.isPending}
            loadingText="Checking..."
          >
            <Lock className="h-5 w-5" /> Open Stock
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full gap-2"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="h-5 w-5" /> Back to Billing
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Signed in as {user?.name}.
        </p>

        {stockUnlock.isPending ? (
          <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Spinner className="h-4 w-4" /> Checking the PIN on the server...
          </p>
        ) : null}
      </div>
    </div>
  );
}
