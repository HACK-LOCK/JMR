/**
 * The two small pieces of motion the whole public site is built on.
 *
 * Both are deliberately conservative. A customer on a cheap phone over a weak
 * connection should still get the full page, so anything here that can fail
 * leaves the content visible rather than hidden. A fade that never runs is
 * harmless; a section stuck at zero opacity is a broken website.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * True when the device asks for reduced motion. Starts as false and is set after
 * mount, so the first paint always matches whatever the page is doing anyway.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent): void => setReduced(event.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  return reduced;
}

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger in milliseconds. Only ever used to space out a row of siblings. */
  delay?: number;
}

/**
 * Fades its children up the first time they scroll into view.
 *
 * Starts visible on purpose. An element is only hidden once the browser has
 * confirmed it is below the fold and the observer is running, so the page is
 * never blank on a slow connection, with JavaScript disabled, or on a device
 * asking for reduced motion.
 */
export function Reveal({ children, className, delay = 0 }: RevealProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (reduced || !element) return;
    if (typeof IntersectionObserver === 'undefined') return;

    // Only wait for elements that genuinely start off screen. Anything already
    // in view is left alone, otherwise the page would flash on arrival.
    if (element.getBoundingClientRect().top < window.innerHeight) return;

    setShown(false);

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.04 },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [reduced]);

  return (
    <div
      ref={ref}
      className={cn(
        'transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none motion-reduce:transform-none',
        className,
      )}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? undefined : 'translateY(16px)',
        transitionDelay: delay > 0 && !shown ? `${delay}ms` : undefined,
      }}
    >
      {children}
    </div>
  );
}

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
  /** Index within its row, used to space siblings out by a few tens of ms. */
  index: number;
}

/**
 * A card that lifts a little on hover and settles back on tap.
 *
 * The transform is small on purpose. A card that jumps is a toy; a card that
 * settles two pixels and returns is a button.
 */
export function StaggerItem({ children, className, index }: StaggerItemProps): JSX.Element {
  return (
    <Reveal delay={(index % 4) * 60} className={className}>
      {children}
    </Reveal>
  );
}
