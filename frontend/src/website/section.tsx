/**
 * The page frame every section sits in: one width, one padding, one heading
 * rhythm. Having it in one place is what keeps eight sections from drifting into
 * eight different left edges as they are edited later.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Reveal } from './reveal';

export const SITE_CONTAINER = 'mx-auto w-full max-w-6xl px-5 sm:px-6 lg:px-8';

export type SectionTone = 'plain' | 'muted' | 'dark';

const TONE_CLASS: Record<SectionTone, string> = {
  plain: 'bg-background text-foreground',
  muted: 'bg-muted/50 text-foreground',
  dark: 'bg-slate-950 text-slate-50',
};

interface SectionProps {
  id: string;
  children: ReactNode;
  tone?: SectionTone;
  className?: string;
  /** Keeps the section clear of the fixed header when a nav link jumps to it. */
  spaced?: boolean;
}

export function Section({
  id,
  children,
  tone = 'plain',
  className,
  spaced = true,
}: SectionProps): JSX.Element {
  return (
    <section
      id={id}
      // A jump from the navigation must not tuck the heading under the header.
      className={cn(TONE_CLASS[tone], 'scroll-mt-20', spaced && 'py-16 sm:py-20 lg:py-24', className)}
    >
      {children}
    </section>
  );
}

interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  /** Small line above the title. Used sparingly. */
  eyebrow?: string;
  tone?: SectionTone;
  align?: 'left' | 'center';
  id?: string;
}

export function SectionHeading({
  title,
  subtitle,
  eyebrow,
  tone = 'plain',
  align = 'center',
  id,
}: SectionHeadingProps): JSX.Element {
  const dark = tone === 'dark';
  return (
    <Reveal className={cn(align === 'center' && 'mx-auto max-w-2xl text-center')}>
      {eyebrow ? (
        <p
          className={cn(
            'mb-3 text-xs font-bold uppercase tracking-[0.18em]',
            dark ? 'text-sky-300' : 'text-primary',
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <h2
        id={id}
        className={cn(
          'text-2xl font-black leading-tight tracking-tight sm:text-3xl lg:text-4xl',
          dark && 'text-white',
        )}
      >
        {title}
      </h2>
      {subtitle ? (
        <p className={cn('mt-3 text-base leading-relaxed sm:text-lg', dark ? 'text-slate-300' : 'text-muted-foreground')}>
          {subtitle}
        </p>
      ) : null}
    </Reveal>
  );
}
