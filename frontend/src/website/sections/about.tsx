/**
 * The shop in a paragraph, plus the three things a visitor most often wants to
 * know before setting off: what it does, where it is, and how to reach it.
 */
import { MapPin, Phone, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section, SectionHeading, SITE_CONTAINER } from '../section';
import { Reveal } from '../reveal';
import {
  ABOUT_PARAGRAPHS,
  ADDRESS_LINES,
  CITY,
  CONTACTS,
  SHOP_NAME,
  directionsUrl,
  telHref,
} from '../site-data';

export function About(): JSX.Element {
  const firstContact = CONTACTS[0];

  return (
    <Section id="about">
      <div className={SITE_CONTAINER}>
        <div className="grid items-start gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
          <div>
            <SectionHeading
              align="left"
              eyebrow="About the shop"
              title={SHOP_NAME}
              subtitle={CITY}
            />

            <div className="mt-6 space-y-4">
              {ABOUT_PARAGRAPHS.map((paragraph) => (
                <Reveal key={paragraph}>
                  <p className="text-base leading-relaxed text-muted-foreground">{paragraph}</p>
                </Reveal>
              ))}
            </div>

            <Reveal>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                {firstContact ? (
                  <Button asChild size="lg" className="w-full sm:w-auto">
                    <a href={telHref(firstContact.number)}>
                      <Phone className="h-5 w-5" aria-hidden />
                      Call Now
                    </a>
                  </Button>
                ) : null}
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <a href="#location">
                    <MapPin className="h-5 w-5" aria-hidden />
                    Visit the Shop
                  </a>
                </Button>
              </div>
            </Reveal>
          </div>

          {/* The address, written out the way it is on the board, so it can be
              matched against Google Maps before anyone sets off. */}
          <Reveal>
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <span
                aria-hidden
                className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary"
              >
                <Store className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-lg font-bold">Find the shop</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                M. Tower Chowk, opposite the Market Yard, on Modasa Road.
              </p>
              <address className="mt-4 not-italic">
                <ul className="space-y-1.5 text-sm font-semibold leading-relaxed">
                  {ADDRESS_LINES.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </address>
              <Button asChild variant="secondary" className="mt-5 w-full">
                <a href={directionsUrl()} target="_blank" rel="noopener noreferrer">
                  <MapPin className="h-4 w-4" aria-hidden />
                  Get Directions
                </a>
              </Button>
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
