// Client-page icons: destination-type tiles (generic glyphs, not brand logos) and a few UI strokes. Server-safe.
import type { ReactNode, SVGProps } from "react";
import type { DestinationType } from "../admin/types";

type P = SVGProps<SVGSVGElement>;
const stroke = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

const GLYPHS: Record<DestinationType, ReactNode> = {
  google_review: <path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" fill="currentColor" stroke="none" />,
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="3.9" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  facebook: <path d="M13.6 21v-7.3h2.6l.4-3h-3V8.9c0-.9.3-1.5 1.6-1.5h1.6V4.7c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H8v3h2.6V21z" fill="currentColor" stroke="none" />,
  tiktok: (
    <>
      <path d="M14.5 3.5v11a3.6 3.6 0 1 1-3.6-3.6" />
      <path d="M14.5 3.5c.4 2.6 2.1 4.2 4.6 4.4" />
    </>
  ),
  menu: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5s1.1-6.1 3.5-8.5z" />
    </>
  ),
  website: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5s1.1-6.1 3.5-8.5z" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M20 11.6a8 8 0 0 1-11.7 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.6z" />
      <path d="M9.2 8.8c.2-.4.6-.5.9-.4l.8 1.6c.1.2 0 .5-.2.7l-.5.5c.6 1.2 1.6 2.2 2.8 2.8l.5-.5c.2-.2.5-.3.7-.2l1.6.8c.1.3 0 .7-.4.9-1 .7-2.6.4-4.3-1.3S8.5 9.8 9.2 8.8z" fill="currentColor" stroke="none" />
    </>
  ),
  contact: <path d="M6 4h2.8l1.6 4.2-2 1.3a10.5 10.5 0 0 0 6.1 6.1l1.3-2 4.2 1.6V18a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4 6.2 2 2 0 0 1 6 4z" />,
  custom: (
    <>
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />
    </>
  ),
};

/** Coloured rounded tile with the destination type's glyph. */
export function DestIcon({ type, size = 40, unset }: { type: DestinationType; size?: number; unset?: boolean }) {
  return (
    <span className={`pt-dt${unset ? " unset" : ` dt-${type}`}`} style={{ width: size, height: size }} aria-hidden>
      <svg {...stroke} width={Math.round(size * 0.55)} height={Math.round(size * 0.55)}>
        {unset ? GLYPHS.custom : GLYPHS[type]}
      </svg>
    </span>
  );
}

export const IconExternal = (p: P) => (
  <svg {...stroke} {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </svg>
);
export const IconPencil = (p: P) => (
  <svg {...stroke} {...p}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </svg>
);
export const IconPin = (p: P) => (
  <svg {...stroke} {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);
export const IconClock = (p: P) => (
  <svg {...stroke} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
export const IconCheck = (p: P) => (
  <svg {...stroke} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
);
export const IconX = (p: P) => (
  <svg {...stroke} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const IconPlus = (p: P) => (
  <svg {...stroke} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconArrow = (p: P) => (
  <svg {...stroke} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const IconChat = (p: P) => (
  <svg {...stroke} {...p}>
    <path d="M20 11.6a8 8 0 0 1-11.7 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.6z" />
  </svg>
);
export const IconLock = (p: P) => (
  <svg {...stroke} {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </svg>
);
