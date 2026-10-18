import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

/** Wordmark symbol: a timetable sheet with a filing tab. */
export const Mark = (p: P) => (
  <svg viewBox="0 0 32 32" aria-hidden {...p}>
    <path d="M4 9h9l2-4h13v23H4z" fill="#0f6f66" />
    <path d="M8 14h16M8 19h16M8 24h10M14 11v15M20 11v15" stroke="#ffffff" strokeWidth="1.8" />
  </svg>
);
export const Check = (p: P) => <svg {...base} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const Lock = (p: P) => <svg {...base} {...p}><rect x="5" y="11" width="14" height="10" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
export const Chevron = (p: P) => <svg {...base} {...p}><path d="M6 9l6 6 6-6" /></svg>;
export const ArrowRight = (p: P) => <svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const ArrowLeft = (p: P) => <svg {...base} {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>;
export const Undo = (p: P) => <svg {...base} {...p}><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>;
export const Redo = (p: P) => <svg {...base} {...p}><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></svg>;

/* Step icons for the sidebar. */
export const IconHome = (p: P) => <svg {...base} {...p}><path d="M4 11l8-6 8 6" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></svg>;
export const IconClock = (p: P) => <svg {...base} {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>;
export const IconBook = (p: P) => <svg {...base} {...p}><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5z" /><path d="M5 20.5A2.5 2.5 0 0 1 7.5 18H19v3H7.5" /></svg>;
export const IconTeacher = (p: P) => <svg {...base} {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>;
export const IconClass = (p: P) => <svg {...base} {...p}><circle cx="9" cy="8.5" r="3" /><circle cx="17" cy="9.5" r="2.5" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M14.5 15.2A4.5 4.5 0 0 1 21 19" /></svg>;
export const IconDoor = (p: P) => <svg {...base} {...p}><path d="M6 21V4h12v17" /><path d="M3 21h18" /><circle cx="14.5" cy="12.5" r="0.6" fill="currentColor" /></svg>;
export const IconLessons = (p: P) => <svg {...base} {...p}><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h1M4 12h1M4 18h1" /></svg>;
export const IconCalendarOff = (p: P) => <svg {...base} {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8 3v4M16 3v4" /><path d="M10 13.5l4 4M14 13.5l-4 4" /></svg>;
export const IconSparkle = (p: P) => <svg {...base} {...p}><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z" /></svg>;
export const IconPrinter = (p: P) => <svg {...base} {...p}><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></svg>;
export const IconChart = (p: P) => <svg {...base} {...p}><path d="M4 20h16" /><path d="M7 16v-5M12 16V6M17 16v-8" /></svg>;
export const IconPanel = (p: P) => <svg {...base} {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="M14 10l-2 2 2 2" /></svg>;
