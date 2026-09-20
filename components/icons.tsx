/**
 * One icon family, drawn in the sheet's own grammar: a 1.5px pen with square caps and mitred
 * joins on a 20px grid. Icons are decorative; the word next to them (or an aria-label on the
 * control) carries the meaning.
 */
import type { ReactNode } from "react";

type IconProps = { size?: number; className?: string };

function Icon({ size = 18, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter" aria-hidden focusable={false} className={className}>
      {children}
    </svg>
  );
}

export const ChevronLeft = (p: IconProps) => <Icon {...p}><path d="M12 4.5 6.5 10l5.5 5.5" /></Icon>;
export const ChevronRight = (p: IconProps) => <Icon {...p}><path d="M8 4.5 13.5 10 8 15.5" /></Icon>;
export const ChevronDown = (p: IconProps) => <Icon {...p}><path d="M4.5 7.5 10 13l5.5-5.5" /></Icon>;
export const Plus = (p: IconProps) => <Icon {...p}><path d="M10 4v12M4 10h12" /></Icon>;
export const Check = (p: IconProps) => <Icon {...p}><path d="m4.5 10.5 3.5 3.5 7.5-8" /></Icon>;
export const Cross = (p: IconProps) => <Icon {...p}><path d="m5 5 10 10M15 5 5 15" /></Icon>;
export const ArrowRight = (p: IconProps) => <Icon {...p}><path d="M4 10h12M11.5 5.5 16 10l-4.5 4.5" /></Icon>;
export const Search = (p: IconProps) => <Icon {...p}><circle cx="9" cy="9" r="5.25" /><path d="m13 13 3.5 3.5" /></Icon>;
export const Clock = (p: IconProps) => <Icon {...p}><circle cx="10" cy="10" r="7" /><path d="M10 6v4.2l2.6 1.6" /></Icon>;
export const Pencil = (p: IconProps) => <Icon {...p}><path d="M12.8 4.2a1.6 1.6 0 0 1 2.3 0l.7.7a1.6 1.6 0 0 1 0 2.3L7.5 15.5 4 16l.5-3.5z" /></Icon>;
export const Archive = (p: IconProps) => <Icon {...p}><rect x="3" y="4" width="14" height="4" rx="1" /><path d="M4.5 8v6.5A1.5 1.5 0 0 0 6 16h8a1.5 1.5 0 0 0 1.5-1.5V8M8 11.5h4" /></Icon>;
export const Undo = (p: IconProps) => <Icon {...p}><path d="M7.5 5 4 8.5 7.5 12" /><path d="M4 8.5h7.5a4.5 4.5 0 0 1 0 9H9" /></Icon>;
export const Alert = (p: IconProps) => <Icon {...p}><path d="M10 3.5 17.5 16h-15z" /><path d="M10 8.5v3.5M10 14.2v.1" /></Icon>;
export const Info = (p: IconProps) => <Icon {...p}><circle cx="10" cy="10" r="7" /><path d="M10 9.2v4.3M10 6.6v.1" /></Icon>;
export const Ruler = (p: IconProps) => <Icon {...p}><rect x="2.5" y="6.5" width="15" height="7" rx="1.5" /><path d="M6 6.5v3M9 6.5v2M12 6.5v3M15 6.5v2" /></Icon>;
/** A dimension line overshooting its end tick: "longer than the berth". */
export const Overrun = (p: IconProps) => <Icon {...p}><path d="M3 5.5v9M11.5 5.5v9M3 10h14.5" /><path d="m14.5 7 3 3-3 3" /></Icon>;
export const NoteLines = (p: IconProps) => <Icon {...p}><path d="M5 6h10M5 10h10M5 14h6" /></Icon>;

/** Vessel. */
export const Ship = (p: IconProps) => (
  <Icon {...p}><path d="M3 12.5h14l-1.8 3.2a1.5 1.5 0 0 1-1.3.8H6.1a1.5 1.5 0 0 1-1.3-.8z" /><path d="M6 12.5V8.5h8v4M10 8.5V4M10 5h3" /></Icon>
);
/** Event. */
export const Flag = (p: IconProps) => <Icon {...p}><path d="M5 17V3.5" /><path d="M5 4.5c3-1.6 5 1.6 9 0v7c-4 1.6-6-1.6-9 0" /></Icon>;
/** Closure. */
export const Barrier = (p: IconProps) => <Icon {...p}><rect x="2.5" y="6" width="15" height="5" rx="1" /><path d="M5.5 11v5M14.5 11v5M6.5 6l-2 5M11 6l-2 5M15.5 6l-2 5" /></Icon>;
/** Brand mark. */
export const Anchor = (p: IconProps) => (
  <Icon {...p}><circle cx="10" cy="4.75" r="1.75" /><path d="M10 6.5V17M6.5 9.5h7" /><path d="M3.5 12c.4 3 3 5 6.5 5s6.1-2 6.5-5" /></Icon>
);

export const KIND_ICON = { vessel: Ship, event: Flag, closure: Barrier } as const;
export const KIND_LABEL = { vessel: "Vessel", event: "Event", closure: "Closure" } as const;
