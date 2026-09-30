/**
 * The site header. Sticky, so the phone numbers are one tap away from anywhere
 * on the page, and it tightens up once the page starts moving so it does not
 * eat into a small screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CONTACTS, NAV_LINKS, SHOP_MARK, SHOP_NAME, SHOP_SHORT_NAME, telHref } from './site-data';
import { useReducedMotion } from './reveal';

function ShopLogo(): JSX.Element {
  return (
    <a
      href="#home"
      className="group flex min-w-0 items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label={`${SHOP_NAME} - back to top`}
    >
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-[0.8125rem] font-black tracking-tight text-primary-foreground shadow-sm transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none"
      >
        {SHOP_MARK}
      </span>
      <span className="min-w-0">
        {/* The full name on a wide screen, the short one when there is no room. */}
        <span className="block truncate text-[0.9375rem] font-bold leading-tight sm:text-base">
          <span className="sm:hidden">{SHOP_SHORT_NAME}</span>
          <span className="hidden sm:inline">{SHOP_NAME}</span>
        </span>
        <span className="block text-2xs font-medium text-muted-foreground">Mobile Repairing</span>
      </span>
    </a>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }): JSX.Element {
  return (
    <>
      {NAV_LINKS.map((link) => (
        <a
          key={link.target}
          href={`#${link.target}`}
          onClick={onNavigate}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {link.label}
        </a>
      ))}
    </>
  );
}

export function SiteHeader(): JSX.Element {
  const [open, setOpen] = useState(false);
  // Kept separate from `open` so the panel can stay in the document long enough
  // to animate shut. Unmounting it on the spot is what makes a menu look like
  // it blinks rather than closes.
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const reduced = useReducedMotion();

  const firstContact = CONTACTS[0];

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    if (reduced) {
      setMounted(false);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), 200);
    return () => window.clearTimeout(timer);
  }, [open, mounted, reduced]);

  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // A tap anywhere else, or the Escape key, closes the menu. Without this the
  // panel sits over the page and there is no obvious way out of it.
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        close();
        toggleRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || toggleRef.current?.contains(target)) return;
      close();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, close]);

  // The menu panel is a dropdown over the page, not a takeover of it, so the
  // page behind it should still scroll rather than lock.
  const panelMotion = reduced
    ? 'transition-none'
    : 'transition-[opacity,transform] duration-200 ease-out';

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b bg-background/85 backdrop-blur-md transition-shadow duration-200',
        scrolled ? 'border-border shadow-sm' : 'border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-5 sm:px-6 lg:px-8">
        <ShopLogo />

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          <NavItems />
        </nav>

        <div className="flex items-center gap-2">
          {firstContact ? (
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <a href={telHref(firstContact.number)}>
                <Phone className="h-4 w-4" aria-hidden />
                Call Now
              </a>
            </Button>
          ) : null}

          <button
            ref={toggleRef}
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="site-mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="grid h-11 w-11 place-items-center rounded-xl border bg-card text-foreground transition-colors duration-150 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
          >
            {/* Two bars that rotate into a cross, and one that fades out. */}
            <span aria-hidden className="relative block h-4 w-5">
              <span
                className={cn(
                  'absolute left-0 top-0.5 h-0.5 w-5 rounded-full bg-current transition-transform duration-200 ease-out motion-reduce:transition-none',
                  open && 'translate-y-[3px] rotate-45',
                )}
              />
              <span
                className={cn(
                  'absolute left-0 top-[7px] h-0.5 w-5 rounded-full bg-current transition-opacity duration-150 motion-reduce:transition-none',
                  open ? 'opacity-0' : 'opacity-100',
                )}
              />
              <span
                className={cn(
                  'absolute left-0 top-[13px] h-0.5 w-5 rounded-full bg-current transition-transform duration-200 ease-out motion-reduce:transition-none',
                  open && '-translate-y-[5px] -rotate-45',
                )}
              />
            </span>
          </button>
        </div>
      </div>

      {mounted ? (
        <div
          id="site-mobile-menu"
          ref={panelRef}
          className={cn(
            'overflow-hidden border-t bg-background shadow-sm md:hidden',
            panelMotion,
            open ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0',
          )}
        >
          <nav aria-label="Main" className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-5 py-4 sm:px-6 lg:px-8">
            <NavItems onNavigate={close} />

            <div className="mt-3 grid gap-2 border-t pt-4">
              {CONTACTS.map((contact) => (
                <Button key={contact.number} asChild variant="outline" className="justify-start">
                  <a href={telHref(contact.number)} onClick={close}>
                    <Phone className="h-4 w-4" aria-hidden />
                    <span className="font-bold">{contact.name}</span>
                    <span className="tabular text-muted-foreground">{contact.number}</span>
                  </a>
                </Button>
              ))}
              <Button asChild variant="secondary" className="justify-start">
                <a href="#location" onClick={close}>
                  <MapPin className="h-4 w-4" aria-hidden />
                  Get Directions
                </a>
              </Button>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
