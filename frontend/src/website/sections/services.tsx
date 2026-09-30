/**
 * The full list of problems the shop fixes.
 *
 * Deliberately a flat grid. A customer arriving with a broken phone is looking
 * for their own symptom, and sorting twenty problems into invented categories
 * would only make them hunt for it. The names are the ones written on the shop
 * board, word for word, so it matches what they were told at the counter.
 */
import { ArrowRight } from 'lucide-react';
import { Section, SectionHeading, SITE_CONTAINER } from '../section';
import { StaggerItem } from '../reveal';
import { SERVICES } from '../site-data';

export function Services(): JSX.Element {
  return (
    <Section id="services">
      <div className={SITE_CONTAINER}>
        <SectionHeading
          eyebrow="What we fix"
          title="Our Repair Services"
          subtitle="If your phone is showing any of these problems, bring it to the shop and it will be checked before you pay anything."
        />

        {/*
          The reveal wrapper is a div, so it goes inside the list item rather than
          around it. A <ul> whose children are <div>s is not a list to a screen
          reader, and a screen reader is a likely way in for someone who cannot
          use a phone screen well.
        */}
        <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service, index) => (
            <li key={service.name} className="h-full">
              <StaggerItem index={index} className="h-full">
                <div className="group flex h-full items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none">
                  <span
                    aria-hidden
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground"
                  >
                    <service.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1 text-[0.9375rem] font-semibold leading-snug">
                    {service.name}
                  </span>
                  {/* Sits back until the card is pointed at, so twenty arrows do
                      not compete with twenty service names. */}
                  <ArrowRight
                    aria-hidden
                    className="h-4 w-4 shrink-0 -translate-x-1 text-primary opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none"
                  />
                </div>
              </StaggerItem>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
