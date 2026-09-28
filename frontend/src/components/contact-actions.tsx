import { MessageCircle, Phone } from 'lucide-react';
import { useSettings } from '@/hooks/use-queries';
import { callLink, whatsappLink, type BillForMessage } from '@/lib/bill-message';
import { cn } from '@/lib/utils';

/**
 * The two buttons an employee needs on every bill: call the customer, or put
 * the bill in their WhatsApp chat. Both build their target from the shop
 * settings stored on the server.
 */
export function ContactActions({
  order,
  size = 'sm',
  className,
}: {
  order: BillForMessage & { mobile: string };
  size?: 'sm' | 'md';
  className?: string;
}): JSX.Element | null {
  const { data: settings } = useSettings();
  if (!order.mobile) return null;

  const dimensions =
    size === 'md'
      ? 'min-h-[48px] flex-1 gap-2 text-sm'
      : 'min-h-[40px] gap-1.5 px-2.5 text-xs';

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <a
        href={callLink(order.mobile)}
        className={cn(
          'inline-flex items-center justify-center rounded-xl border-2 border-input bg-background font-bold text-foreground transition-colors active:bg-secondary',
          dimensions,
        )}
      >
        <Phone className={size === 'md' ? 'h-5 w-5' : 'h-4 w-4'} />
        Call
      </a>
      {/*
        The bill text is built from the shop settings on the server, so the
        button stays unclickable until they arrive. A bill must never go out
        with a half filled header.
      */}
      {settings ? (
        <a
          href={whatsappLink(order.mobile, order, settings)}
          target="_blank"
          rel="noreferrer"
          className={cn(
            'inline-flex items-center justify-center rounded-xl bg-success font-bold text-success-foreground transition-opacity active:opacity-80',
            dimensions,
          )}
        >
          <MessageCircle className={size === 'md' ? 'h-5 w-5' : 'h-4 w-4'} />
          WhatsApp
        </a>
      ) : (
        <span
          aria-disabled
          aria-label="WhatsApp, loading shop settings"
          className={cn(
            'inline-flex items-center justify-center rounded-xl bg-muted font-bold text-muted-foreground',
            dimensions,
          )}
        >
          <MessageCircle className={size === 'md' ? 'h-5 w-5' : 'h-4 w-4'} />
          WhatsApp
        </span>
      )}
    </div>
  );
}
