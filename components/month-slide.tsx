"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

// Survives client navigations (the module stays loaded), which is exactly the lifetime we want.
let previousMonth: string | null = null;

/** Slides the grid in from the side you travelled to: next month from the right, previous from the left. */
export function MonthSlide({ month, children }: { month: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && previousMonth && previousMonth !== month) {
      el.dataset.dir = month > previousMonth ? "next" : "prev";
      const clear = () => delete el.dataset.dir;
      el.addEventListener("animationend", clear, { once: true });
    }
    previousMonth = month;
  }, [month]);
  return <div ref={ref} className="month-slide">{children}</div>;
}
