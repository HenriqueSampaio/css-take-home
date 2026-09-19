"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Selecting a stay renders its panel, which on most monitors sits below the grid. Without
 * this, a keyboard user would have to tab through every remaining stay to reach it and a
 * screen reader would hear nothing. On mount: bring the panel into view and move focus to it.
 */
export function PanelFocus({ children, className, labelledBy }: { children: ReactNode; className?: string; labelledBy: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, []);
  return (
    <aside ref={ref} tabIndex={-1} className={className} aria-labelledby={labelledBy}>
      {children}
    </aside>
  );
}
