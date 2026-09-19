"use client";

import { useEffect } from "react";

const ZONE = "America/New_York";

/** Fraction of the facility's day that has passed, 0..1. */
function dayFraction(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 12) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return (hour * 60 + minute) / 1440;
}

/**
 * Keeps the schedule's now-lines at the actual time of day. It renders nothing: it sets one
 * CSS variable on the grid, and every row's line positions itself from it.
 */
export function NowLineClock({ targetId }: { targetId: string }) {
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const tick = () => el.style.setProperty("--now-frac", dayFraction(new Date()).toFixed(4));
    tick();
    // On a narrow screen the month scrolls sideways and opens on day 1. Bring today into view instead:
    // the days before it cannot be booked, so they are the least useful thing to land on.
    const scroller = el.parentElement;
    const todayCell = el.querySelector<HTMLElement>(".day-cell.is-today");
    const pinned = el.querySelector<HTMLElement>(".schedule-berth");
    if (scroller && todayCell && pinned && scroller.scrollWidth > scroller.clientWidth) {
      scroller.scrollLeft = Math.max(0, todayCell.offsetLeft - todayCell.offsetWidth);
    }
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [targetId]);
  return null;
}
