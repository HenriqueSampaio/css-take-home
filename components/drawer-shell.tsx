"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * The reservation drawer floats over the right edge of the page (a bottom sheet on phones).
 * It is not a modal: the grid stays usable behind it. On open, focus moves into it so it is
 * announced and reachable; Escape closes it and returns focus to the chip that opened it.
 */
export function DrawerShell({ children, closeHref, returnFocusId, labelledBy }: { children: ReactNode; closeHref: string; returnFocusId: string; labelledBy: string }) {
  const router = useRouter();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      router.push(closeHref, { scroll: false });
      requestAnimationFrame(() => document.getElementById(returnFocusId)?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHref, returnFocusId, router]);

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-labelledby={labelledBy}
      className="drawer fixed inset-x-0 bottom-0 z-40 max-h-[85dvh] overflow-y-auto border-t-[1.5px] border-ink bg-sheet-raised shadow-[var(--shadow-float)] outline-none lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-[5.5rem] lg:max-h-none lg:w-[26rem] lg:border-[1.5px]"
    >
      {children}
    </aside>
  );
}
