/**
 * Where the shop is.
 *
 * The map here is drawn artwork, not a real map. The shop has no verified
 * coordinates, and a hard coded pin would send somebody to the wrong side of
 * Talod. So the picture only sets the scene, the address is written out, and the
 * button hands the address to Google Maps and lets it find the shop. The panel
 * says as much, rather than pretending to be a map it is not.
 */
import { MapPin, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section, SectionHeading, SITE_CONTAINER } from '../section';
import { Reveal } from '../reveal';
import { ADDRESS_LINES, SHOP_NAME, directionsUrl } from '../site-data';

/** Decorative street grid. Purely scenery. */
function MapArtwork(): JSX.Element {
  return (
    <svg
      viewBox="0 0 400 300"
      aria-hidden
      className="h-full w-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="400" height="300" fill="hsl(214 32% 96%)" />

      {/* Blocks */}
      <g fill="hsl(214 32% 91%)">
        <rect x="18" y="18" width="96" height="70" rx="6" />
        <rect x="132" y="18" width="78" height="70" rx="6" />
        <rect x="228" y="18" width="60" height="70" rx="6" />
        <rect x="306" y="18" width="76" height="70" rx="6" />
        <rect x="18" y="106" width="96" height="66" rx="6" />
        <rect x="306" y="106" width="76" height="66" rx="6" />
        <rect x="18" y="190" width="96" height="92" rx="6" />
        <rect x="132" y="190" width="78" height="92" rx="6" />
        <rect x="228" y="190" width="154" height="92" rx="6" />
      </g>

      {/* Roads */}
      <g stroke="hsl(0 0% 100%)" strokeWidth="14" strokeLinecap="round">
        <path d="M124 10v280" />
        <path d="M220 10v180" />
        <path d="M296 10v280" />
        <path d="M10 98h380" />
        <path d="M10 182h380" />
      </g>

      {/* The route in, drawn over a road junction. */}
      <path
        d="M200 292v-40c0-14 12-24 26-24h34"
        fill="none"
        stroke="hsl(221 83% 53%)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray="2 16"
        opacity="0.85"
      />

      {/* The shop, as a marker on the illustration. */}
      <g transform="translate(266 200)">
        <circle r="30" fill="hsl(221 83% 53% / 0.14)" />
        <path
          d="M0-24c-9.9 0-18 8.1-18 18 0 13.5 18 30 18 30s18-16.5 18-30c0-9.9-8.1-18-18-18z"
          fill="hsl(221 83% 53%)"
        />
        <circle cy="-6" r="6.5" fill="#fff" />
      </g>
    </svg>
  );
}

export function Location(): JSX.Element {
  return (
    <Section id="location">
      <div className={SITE_CONTAINER}>
        <SectionHeading
          eyebrow="Location"
          title="Find Us in Talod"
          subtitle="M. Tower Chowk, opposite the Market Yard, on Modasa Road."
        />

        <Reveal className="mt-10">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="grid md:grid-cols-[1.1fr_0.9fr]">
              <div className="relative min-h-56 bg-muted sm:min-h-72">
                <MapArtwork />
                {/* Said plainly, so the artwork is never mistaken for the thing
                    it stands in for. */}
                <p className="absolute bottom-3 left-3 right-3 rounded-lg bg-background/90 px-3 py-2 text-xs text-muted-foreground backdrop-blur-sm">
                  Not a live map. Directions are opened in Google Maps using the shop address.
                </p>
              </div>

              <div className="flex flex-col justify-center gap-5 p-6 sm:p-8">
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {SHOP_NAME}
                  </p>
                  <address className="mt-2.5 not-italic">
                    <ul className="space-y-1 text-sm leading-relaxed text-muted-foreground">
                      {ADDRESS_LINES.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </address>
                </div>

                <Button asChild size="lg" className="w-full">
                  <a href={directionsUrl()} target="_blank" rel="noopener noreferrer">
                    <Navigation className="h-5 w-5" aria-hidden />
                    Open in Google Maps
                  </a>
                </Button>
                <p className="text-xs text-muted-foreground">
                  Opens a search for the shop address in Google Maps, so you are taken to
                  where the shop actually is.
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
