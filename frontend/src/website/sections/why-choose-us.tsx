/**
 * Six plain reasons to walk in. Kept factual on purpose: nothing here claims a
 * guarantee or a ranking, because a claim like that is the first thing a
 * customer learns not to believe once they have been on the receiving end of one.
 */
import { Section, SectionHeading, SITE_CONTAINER } from '../section';
import { StaggerItem } from '../reveal';
import { BENEFITS } from '../site-data';

export function WhyChooseUs(): JSX.Element {
  return (
    <Section id="why-us" tone="muted">
      <div className={SITE_CONTAINER}>
        <SectionHeading
          eyebrow="Why choose us"
          title="Straightforward Work, Clearly Explained"
          subtitle="A small shop that would rather tell you the truth about your phone than talk you into a new one."
        />

        <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((benefit, index) => (
            <li key={benefit.title} className="h-full">
              <StaggerItem index={index} className="h-full">
                <div className="group flex h-full gap-4 rounded-2xl border bg-card p-5 shadow-sm transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none">
                  <span
                    aria-hidden
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground"
                  >
                    <benefit.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold leading-snug">{benefit.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {benefit.description}
                    </p>
                  </div>
                </div>
              </StaggerItem>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
