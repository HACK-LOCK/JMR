/**
 * The first thing a customer sees. Dark, because a repair shop that opens on a
 * dark screen reads as a workshop rather than a sales counter, and because it
 * gives the page a clear start before it goes light.
 */
import { MapPin, Phone, ShieldCheck, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PhoneArt } from '../phone-art';
import { CITY, CONTACTS, HERO_HEADING, HERO_SUBHEADING, SHOP_NAME, directionsUrl, telHref } from '../site-data';
import { SITE_CONTAINER } from '../section';

/** Short, factual reasons to trust the shop. No superlatives, nothing promised. */
const PROOF = [
  { label: CITY, icon: MapPin },
  { label: 'Walk-in service', icon: Timer },
  { label: 'Hardware & software', icon: ShieldCheck },
];

export function Hero(): JSX.Element {
  const firstContact = CONTACTS[0];

  return (
    <section id="home" className="relative overflow-hidden bg-slate-950 text-slate-50">
      {/* Two wide, very soft light sources. Cheap, and enough to stop the
          background reading as a flat black rectangle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-24 h-[26rem] w-[26rem] rounded-full bg-sky-500/10 blur-3xl"
      />

      <div className={cn(SITE_CONTAINER, 'relative grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8 lg:py-24')}>
        <div className="site-enter">
          {/* The shop name, above the headline: a customer arriving from a
              search result is looking for the name, not the slogan. */}
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-sky-200">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            {SHOP_NAME}
          </p>

          <h1 className="mt-5 text-3xl font-black leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-5xl">
            {HERO_HEADING}
          </h1>

          <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
            {HERO_SUBHEADING}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            {firstContact ? (
              <Button asChild size="lg" className="w-full sm:w-auto">
                <a href={telHref(firstContact.number)}>
                  <Phone className="h-5 w-5" aria-hidden />
                  Call Now
                </a>
              </Button>
            ) : null}
            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:w-auto"
            >
              <a href={directionsUrl()} target="_blank" rel="noopener noreferrer">
                <MapPin className="h-5 w-5" aria-hidden />
                Get Directions
              </a>
            </Button>
          </div>

          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-3">
            {PROOF.map((item) => (
              <li key={item.label} className="flex items-center gap-2 text-sm text-slate-400">
                <item.icon className="h-4 w-4 shrink-0 text-sky-400" aria-hidden />
                {item.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="site-enter site-enter-delay mx-auto w-full max-w-sm lg:max-w-none">
          <PhoneArt />
        </div>
      </div>
    </section>
  );
}
