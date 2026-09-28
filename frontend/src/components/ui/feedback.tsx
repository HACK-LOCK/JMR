import { Loader2, Inbox, AlertTriangle, RefreshCw, WifiOff, CheckCircle2 } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }): JSX.Element {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-muted-foreground', className)} />;
}

export function LoadingBlock({ label = 'Loading...' }: { label?: string }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-muted-foreground">
      <Spinner className="h-7 w-7" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: typeof Inbox;
  title: string;
  description?: string;
  action?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-12 text-center">
      <div className="rounded-full bg-muted p-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-base font-semibold">{title}</p>
      {description ? <p className="max-w-xs text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorBlock({
  message,
  offline = false,
  onRetry,
}: {
  message: string;
  offline?: boolean;
  onRetry?: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-destructive/30 bg-destructive/5 px-6 py-8 text-center">
      <div className="rounded-full bg-destructive/10 p-3">
        {offline ? (
          <WifiOff className="h-6 w-6 text-destructive" />
        ) : (
          <AlertTriangle className="h-6 w-6 text-destructive" />
        )}
      </div>
      <p className="text-sm font-semibold text-destructive">{message}</p>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Try again
        </Button>
      ) : null}
    </div>
  );
}

export function InlineNotice({
  tone = 'info',
  children,
  className,
}: {
  tone?: 'info' | 'warning' | 'error' | 'success';
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  const tones = {
    info: 'border-primary/30 bg-primary/5 text-primary',
    warning: 'border-warning/40 bg-warning/10 text-warning-foreground',
    error: 'border-destructive/30 bg-destructive/5 text-destructive',
    success: 'border-success/30 bg-success/5 text-success',
  } as const;
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Inbox : AlertTriangle;
  return (
    <div className={cn('flex items-start gap-2 rounded-xl border-2 p-3', tones[tone], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 text-sm font-medium leading-snug">{children}</div>
    </div>
  );
}
