import Link from "next/link";
import { Anchor, Plus } from "./icons";
import { LiveClock } from "./live-clock";
import { NavLinks, type NavItem } from "./nav-links";

const ZONE = "America/New_York";

const ITEMS: NavItem[] = [
  { href: "/schedule", label: "Schedule", match: ["/schedule", "/reservations"] },
  { href: "/berths", label: "Berths", match: ["/berths"] },
  { href: "/vessels", label: "Vessels", match: ["/vessels"] },
];

/** Brand, three destinations, the live date and time, and the one primary action. */
export function TopBar() {
  const now = new Date();
  const initialDate = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short", month: "short", day: "numeric" }).format(now);
  const initialTime = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" }).format(now);
  const initialDay = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[100rem] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 lg:px-8">
        <Link href="/schedule" className="flex items-center gap-2.5 rounded-lg">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-brand text-surface shadow-[0_2px_8px_-2px_rgb(37_99_235/0.6)]"><Anchor size={20} /></span>
          <span className="leading-tight">
            <span className="block text-[1.0625rem] font-extrabold tracking-[-0.01em]">Harborview</span>
            <span className="block text-[0.75rem] font-semibold text-ink-3">Dock schedule</span>
          </span>
        </Link>

        <nav aria-label="Main" className="order-last w-full sm:order-none sm:w-auto">
          <NavLinks items={ITEMS} />
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden md:block"><LiveClock initialDate={initialDate} initialTime={initialTime} initialDay={initialDay} /></div>
          <Link href="/reservations/new" className="btn btn-primary"><Plus size={16} />New reservation</Link>
        </div>
      </div>
    </header>
  );
}
