import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = (props: P) => ({
  width: 14,
  height: 14,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...props,
});

export const IconPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 3v10M3 8h10" />
  </svg>
);
export const IconMinus = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 8h10" />
  </svg>
);
export const IconFit = (p: P) => (
  <svg {...base(p)}>
    <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
  </svg>
);
export const IconUndo = (p: P) => (
  <svg {...base(p)}>
    <path d="M5.5 4 2.5 7l3 3" />
    <path d="M2.5 7H10a3.5 3.5 0 0 1 0 7H8" />
  </svg>
);
export const IconRedo = (p: P) => (
  <svg {...base(p)}>
    <path d="m10.5 4 3 3-3 3" />
    <path d="M13.5 7H6a3.5 3.5 0 0 0 0 7h2" />
  </svg>
);
export const IconRotateCw = (p: P) => (
  <svg {...base(p)}>
    <path d="M13 3v3.5H9.5" />
    <path d="M13 6.5A5.5 5.5 0 1 0 13.5 9" />
  </svg>
);
export const IconRotateCcw = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 3v3.5h3.5" />
    <path d="M3 6.5A5.5 5.5 0 1 1 2.5 9" />
  </svg>
);
export const IconCopy = (p: P) => (
  <svg {...base(p)}>
    <rect x="5.5" y="5.5" width="8" height="8" />
    <path d="M10.5 5.5v-3h-8v8h3" />
  </svg>
);
export const IconTrash = (p: P) => (
  <svg {...base(p)}>
    <path d="M2.5 4.5h11M6 4.5V2.5h4v2M4 4.5l.7 9h6.6l.7-9" />
  </svg>
);
export const IconLock = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="7" width="9" height="6.5" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </svg>
);
export const IconUnlock = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="7" width="9" height="6.5" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1" />
  </svg>
);
export const IconEye = (p: P) => (
  <svg {...base(p)}>
    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
    <circle cx="8" cy="8" r="2" />
  </svg>
);
export const IconEyeOff = (p: P) => (
  <svg {...base(p)}>
    <path d="M2 2l12 12M6.6 3.7A6.8 6.8 0 0 1 8 3.5C12 3.5 14.5 8 14.5 8a11 11 0 0 1-1.9 2.4M4.2 5.1C2.6 6.3 1.5 8 1.5 8S4 12.5 8 12.5c1 0 1.9-.3 2.7-.7" />
  </svg>
);
export const IconChevronLeft = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 3 5 8l5 5" />
  </svg>
);
export const IconChevronRight = (p: P) => (
  <svg {...base(p)}>
    <path d="m6 3 5 5-5 5" />
  </svg>
);
export const IconChevronDown = (p: P) => (
  <svg {...base(p)}>
    <path d="m3 6 5 5 5-5" />
  </svg>
);
export const IconChevronUp = (p: P) => (
  <svg {...base(p)}>
    <path d="m3 10 5-5 5 5" />
  </svg>
);
export const IconX = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
  </svg>
);
export const IconSearch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </svg>
);
export const IconTarget = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="4.5" />
    <path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" />
  </svg>
);
export const IconLayers = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 2 1.5 5.5 8 9l6.5-3.5L8 2Z" />
    <path d="M1.5 8.5 8 12l6.5-3.5" />
  </svg>
);
export const IconHand = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 8.5V4a1 1 0 0 1 2 0v3.5M7 7V3a1 1 0 0 1 2 0v4M9 7V4a1 1 0 0 1 2 0v4.5M11 6.5a1 1 0 0 1 2 0V10a4.5 4.5 0 0 1-4.5 4.5h-.8a4 4 0 0 1-3.1-1.5L2.4 10.3a1 1 0 0 1 1.5-1.3L5 10" />
  </svg>
);
export const IconPointer = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 2.5 12.5 8 8 9l-2 4.5L3 2.5Z" />
  </svg>
);
export const IconGrid = (p: P) => (
  <svg {...base(p)}>
    <path d="M2.5 2.5h11v11h-11zM6.2 2.5v11M9.8 2.5v11M2.5 6.2h11M2.5 9.8h11" />
  </svg>
);
export const IconMagnet = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 2.5v5.5a4.5 4.5 0 0 0 9 0V2.5H10V8a2 2 0 0 1-4 0V2.5H3.5ZM3.5 5h2.5M10 5h2.5" />
  </svg>
);
