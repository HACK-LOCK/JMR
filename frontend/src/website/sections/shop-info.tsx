/**
 * The one card a customer screenshots or copies out of a search result: who to
 * call, where to go, and both numbers as real links rather than digits they
 * have to retype.
 */
import { MapPin, Phone, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section, SectionHeading, SITE_CONTAINER } from '../section';
import { Reveal } from '../reveal';
import { ADDRESS_LINES, CONTACTS, SHOP_NAME, directionsUrl, telHref } from '../site-data';

export function ShopInfo(): JSX.Element {
  return (
    <Section id="shop-info" tone="muted">
      <div className={SITE_CONTAINER}>
        <SectionHeading
          eyebrow="Shop information"
          title="Name, Address and Numbers"
          subtitle="Call ahead if you want to check a part or a price before you come over."
        />

        <Reveal className="mx-auto mt-10 w-full max-w-3xl">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            {/* A slim coloured band instead of a heavy coloured card: the address
                is the important part, so it keeps the page's normal contrast. */}
            <div className="flex items-center gap-3 border-b bg-primary/5 px-5 py-4 sm:px-6">
              <span
                aria-hidden
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-lg font-black text-primary-foreground"
              >
                JM
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Shop
                </p>
                <p className="truncate text-base font-bold leading-tight sm:text-lg">{SHOP_NAME}</p>
              </div>
            </div>

            <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-2">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  Address
                </h3>
                <address className="mt-2.5 not-italic">
                  <ul className="space-y-1 text-sm leading-relaxed text-muted-foreground">
                    {ADDRESS_LINES.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </address>
                <Button
                  asChild
                  variant="secondary"
                  className="mt-4 w-full"
                >
                  <a href={directionsUrl()} target="_blank" rel="noopener noreferrer">
                    <MapPin className="h-4 w-4" aria-hidden />
                    Get Directions
                  </a>
                </Button>
              </div>

              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  Contact
                </h3>
                <ul className="mt-2.5 space-y-2.5">
                  {CONTACTS.map((contact) => (
                    <li key={contact.number}>
                      {/* The whole row is the link, so a thumb anywhere on it
                          dials. The visible number is the number that is called. */}
                      <a
                        href={telHref(contact.number)}
                        className="flex items-center gap-3 rounded-xl border bg-background p-3 transition-colors duration-150 hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <span
                          aria-hidden
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"
                        >
                          <User className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold leading-tight">
                            {contact.name}
                          </span>
                          <span className="tabular block text-sm text-muted-foreground">
                            {contact.number}
                          </span>
                        </span>
                        <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Big tap targets, in the order a customer reaches for them. */}
        <Reveal className="mx-auto mt-6 w-full max-w-3xl">
          <div className="grid gap-3 sm:grid-cols-2">
            {CONTACTS.map((contact) => (
              <Button key={`call-${contact.number}`} asChild size="lg" className="w-full">
                <a href={telHref(contact.number)}>
                  <Phone className="h-5 w-5" aria-hidden />
                  Call {contact.name}
                </a>
              </Button>
            ))}
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
