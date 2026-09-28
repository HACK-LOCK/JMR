import { cn } from '@/lib/utils';

/** Label/value pair used all over the detail screens. */
export function DetailRow({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2', className)}>
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right text-sm font-semibold">{value}</span>
    </div>
  );
}
