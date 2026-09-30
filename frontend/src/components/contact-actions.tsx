import { Phone } from 'lucide-react';
import { useSettings } from '@/hooks/use-queries';
import { callLink, whatsappLink, type BillForMessage } from '@/lib/bill-message';
import { cn } from '@/lib/utils';

/**
 * The two buttons an employee needs on every bill: call the customer, or put
 * the bill in their WhatsApp chat. Both build their target from the shop
 * settings stored on the server.
 */
export function WhatsAppIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn('h-4.5 w-4.5', className)}
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.456 5.711 1.457h.004c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

/**
 * The two buttons an employee needs on every bill: call the customer, or put
 * the bill in their WhatsApp chat. Both build their target from the shop
 * settings stored on the server.
 */
export function ContactActions({
  order,
  size = 'sm',
  iconOnly = false,
  className,
}: {
  order: BillForMessage & { mobile: string };
  size?: 'sm' | 'md';
  iconOnly?: boolean;
  className?: string;
}): JSX.Element | null {
  const { data: settings } = useSettings();
  if (!order.mobile) return null;

  if (iconOnly) {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        <a
          href={callLink(order.mobile)}
          aria-label={`Call ${order.mobile}`}
          title={`Call ${order.mobile}`}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-input bg-background text-foreground transition-all hover:bg-secondary active:scale-95 shadow-2xs"
        >
          <Phone className="h-4.5 w-4.5" />
        </a>
        {settings ? (
          <a
            href={whatsappLink(order.mobile, order, settings)}
            target="_blank"
            rel="noreferrer"
            aria-label={`WhatsApp ${order.mobile}`}
            title={`WhatsApp ${order.mobile}`}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success text-success-foreground transition-all hover:opacity-90 active:scale-95 shadow-2xs"
          >
            <WhatsAppIcon />
          </a>
        ) : (
          <span
            aria-disabled
            aria-label="WhatsApp, loading shop settings"
            title="WhatsApp, loading..."
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
          >
            <WhatsAppIcon />
          </span>
        )}
      </div>
    );
  }

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
          <WhatsAppIcon className={size === 'md' ? 'h-5 w-5' : 'h-4 w-4'} />
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
          <WhatsAppIcon className={size === 'md' ? 'h-5 w-5' : 'h-4 w-4'} />
          WhatsApp
        </span>
      )}
    </div>
  );
}
