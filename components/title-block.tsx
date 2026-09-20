import Link from "next/link";
import { Plus } from "./icons";
import { LiveClock } from "./live-clock";
import { NavLinks, type NavItem } from "./nav-links";

const ZONE = "America/New_York";

const ITEMS: NavItem[] = [
  { href: "/schedule", label: "Schedule", match: ["/schedule", "/reservations"] },
  { href: "/berths", label: "Berths", match: ["/berths"] },
  { href: "/vessels", label: "Vessels", match: ["/vessels"] },
];

/**
 * The header is the drawing's title block: three bordered fields divided by medium rules.
 * What this sheet is; where you can go; and the date and time at the dock beside the one
 * primary action.
 */
export function TitleBlock() {
  const now = new Date();
  const initialDate = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(now);
  const initialTime = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" }).format(now);
  const initialDay = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

  return (
    <header className="border-b-[1.5px] border-ink bg-sheet-sunk">
      <div className="grid grid-cols-1 divide-y divide-line-strong lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:divide-x lg:divide-y-0">
        <Link href="/schedule" className="flex flex-col justify-center px-4 py-3 lg:px-5">
          <span className="t-caption">Harborview Marine Research Center</span>
          <span className="text-[1.25rem] font-semibold leading-tight tracking-[-0.005em]">Dock Schedule</span>
        </Link>
        <nav aria-label="Main" className="min-h-12 px-1 lg:px-2">
          <NavLinks items={ITEMS} />
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-4 py-2.5 lg:px-5">
          <LiveClock initialDate={initialDate} initialTime={initialTime} initialDay={initialDay} />
          <Link href="/reservations/new" className="btn btn-primary"><Plus size={15} />New reservation</Link>
        </div>
      </div>
    </header>
  );
}
