/**
 * Drawn in the sheet's own grammar: 1.5px ink strokes, square caps, no fills unless the
 * shape is a marker. All icons are decorative; the adjacent text or aria-label carries meaning.
 */
type IconProps = { size?: number; className?: string };

const base = (size: number) => ({
  width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor",
  strokeWidth: 1.5, strokeLinecap: "square" as const, strokeLinejoin: "miter" as const,
  "aria-hidden": true, focusable: false,
});

export const ChevronLeft = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M10 3 5 8l5 5" /></svg>
);
export const ChevronRight = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="m6 3 5 5-5 5" /></svg>
);
export const Check = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="m3 8.5 3.2 3.2L13 4.8" /></svg>
);
export const Cross = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="m4 4 8 8M12 4l-8 8" /></svg>
);
export const Plus = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M8 3v10M3 8h10" /></svg>
);
export const Info = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}><circle cx="8" cy="8" r="6.2" /><path d="M8 7.2v4M8 4.8v.2" /></svg>
);

/** A dimension line overshooting its end tick: "longer than the berth". */
export const Overrun = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M2 4v8M9.5 4v8M2 8h12" />
    <path d="m11.8 5.6 2.4 2.4-2.4 2.4" />
  </svg>
);

/** The drafting revision mark, used small inside stay bars. */
export const TriangleMark = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M8 2.6 14 13H2z" /></svg>
);

export const NoteDot = ({ size = 8, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 8 8" aria-hidden focusable={false} className={className}><circle cx="4" cy="4" r="2.4" fill="currentColor" /></svg>
);
