import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

/** Wordmark symbol: a timetable sheet with a filing tab. */
export const Mark = (p: P) => (
  <svg viewBox="0 0 32 32" aria-hidden {...p}>
    <path d="M4 9h9l2-4h13v23H4z" fill="#2c3620" />
    <path d="M8 14h16M8 19h16M8 24h10M14 11v15M20 11v15" stroke="#e3e2da" strokeWidth="1.8" />
  </svg>
);
export const Check = (p: P) => <svg {...base} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const Lock = (p: P) => <svg {...base} {...p}><rect x="5" y="11" width="14" height="10" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
export const Chevron = (p: P) => <svg {...base} {...p}><path d="M6 9l6 6 6-6" /></svg>;
export const ArrowRight = (p: P) => <svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const ArrowLeft = (p: P) => <svg {...base} {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>;
export const Undo = (p: P) => <svg {...base} {...p}><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>;
export const Redo = (p: P) => <svg {...base} {...p}><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></svg>;
