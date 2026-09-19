"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Clock } from "./icons";

const ZONE = "America/New_York";

function read(now: Date) {
  const date = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short", month: "short", day: "numeric" }).format(now);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" }).format(now);
  const isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return { date, time, isoDay };
}

/**
 * The facility's date and time, live. The server renders the first value so there is no
 * flash; after that the clock ticks here. When the DATE changes (midnight at the dock) the
 * page is refreshed, because "today" decides what can be booked and where the now-line sits.
 */
export function LiveClock({ initialDate, initialTime, initialDay }: { initialDate: string; initialTime: string; initialDay: string }) {
  const router = useRouter();
  const [now, setNow] = useState({ date: initialDate, time: initialTime, isoDay: initialDay });

  useEffect(() => {
    let day = initialDay;
    const tick = () => {
      const next = read(new Date());
      setNow(next);
      if (next.isoDay !== day) {
        day = next.isoDay;
        router.refresh();
      }
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [initialDay, router]);

  return (
    <p className="flex items-center gap-2 whitespace-nowrap rounded-full bg-fill py-1.5 pl-2.5 pr-3.5 text-[0.8125rem]" title="Current date and time at the dock (US Eastern)">
      <Clock size={16} className="text-ink-3" />
      <span className="sr-only">Now at the dock: </span>
      <strong className="font-bold">{now.date}</strong>
      <span className="t-num font-medium text-ink-2" suppressHydrationWarning>{now.time} ET</span>
    </p>
  );
}
