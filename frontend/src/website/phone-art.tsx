/**
 * The hero artwork. Drawn as inline SVG rather than shipped as an image so it
 * stays sharp on any screen, costs no extra request, and can be recoloured by
 * the theme. Ids are generated per instance so the gradients cannot collide if
 * the artwork is ever used twice on a page.
 */
import { useId } from 'react';
import { cn } from '@/lib/utils';

interface PhoneArtProps {
  className?: string;
}

export function PhoneArt({ className }: PhoneArtProps): JSX.Element {
  const uid = useId().replace(/:/g, '');
  const glow = `glow-${uid}`;
  const screen = `screen-${uid}`;
  const rim = `rim-${uid}`;

  return (
    <svg
      viewBox="0 0 320 340"
      role="img"
      aria-label="Illustration of a mobile phone being repaired"
      className={cn('h-auto w-full', className)}
    >
      <defs>
        <radialGradient id={glow} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="hsl(221 83% 53% / 0.45)" />
          <stop offset="60%" stopColor="hsl(221 83% 53% / 0.12)" />
          <stop offset="100%" stopColor="hsl(221 83% 53% / 0)" />
        </radialGradient>
        <linearGradient id={screen} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id={rim} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>

      {/* Soft pool of light behind the phone, so it is not floating on flat colour. */}
      <circle cx="160" cy="165" r="150" fill={`url(#${glow})`} />

      <g transform="rotate(-6 160 170)">
        {/* Body */}
        <rect x="98" y="42" width="124" height="236" rx="24" fill="url(#rim)" />
        <rect x="103" y="47" width="114" height="226" rx="20" fill="url(#screen)" />

        {/* Speaker slot and camera. */}
        <rect x="140" y="58" width="40" height="5" rx="2.5" fill="#334155" />
        <circle cx="196" cy="60.5" r="4" fill="#334155" />

        {/* Screen content: a simple repair check panel. */}
        <rect x="118" y="84" width="84" height="112" rx="14" fill="#0b1220" stroke="#1e293b" />
        <circle cx="160" cy="122" r="21" fill="hsl(217 91% 60% / 0.14)" />
        <circle cx="160" cy="122" r="15" fill="hsl(217 91% 60% / 0.22)" />
        <path
          d="M152.5 122.5l5.5 5.5 10-11"
          fill="none"
          stroke="#60a5fa"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="132" y="152" width="56" height="6" rx="3" fill="#1e293b" />
        <rect x="142" y="164" width="36" height="6" rx="3" fill="#1e293b" />
        <rect x="152" y="176" width="16" height="6" rx="3" fill="#1e293b" />

        {/* Home bar */}
        <rect x="140" y="252" width="40" height="5" rx="2.5" fill="#334155" />
      </g>

      {/* A screwdriver, angled across the phone. */}
      <g transform="rotate(38 210 210)">
        <rect x="206" y="150" width="13" height="86" rx="5" fill="#f59e0b" />
        <rect x="206" y="150" width="13" height="34" rx="5" fill="#fbbf24" />
        <rect x="206" y="236" width="13" height="30" rx="3" fill="#cbd5e1" />
        <path d="M206 268h13l-6.5 12z" fill="#94a3b8" />
      </g>

      {/* Chips on the board, floated clear of the phone. */}
      <g opacity="0.9">
        <rect x="44" y="228" width="46" height="34" rx="7" fill="#0f172a" stroke="#334155" />
        <path d="M56 240h10M56 248h18" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
        <rect
          x="60"
          y="212"
          width="4"
          height="16"
          rx="2"
          fill="#334155"
        />
        <rect
          x="70"
          y="212"
          width="4"
          height="16"
          rx="2"
          fill="#334155"
        />
      </g>

      {/* Sparkles. Kept to three, so it reads as polish rather than confetti. */}
      <g fill="#60a5fa">
        <path d="M262 96l3.4 8.6L274 108l-8.6 3.4L262 120l-3.4-8.6L250 108l8.6-3.4z" opacity="0.9" />
        <path d="M58 128l2.6 6.6 6.6 2.6-6.6 2.6L58 146l-2.6-6.2-6.6-2.6 6.6-2.6z" opacity="0.65" />
        <circle cx="278" cy="188" r="4" opacity="0.75" />
      </g>
    </svg>
  );
}
