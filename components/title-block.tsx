import Link from "next/link";
import { getIssueSummary } from "@/lib/db/queries/issues";
import { getAppMeta } from "@/lib/db/queries/meta";
import { formatTimestamp, requestDb } from "@/lib/ui/data";
import { DemoStatus } from "./demo-status";
import { NavLinks, type NavItem } from "./nav-links";
import { RevisionTriangle } from "./revision-triangle";

/**
 * The header is the drawing's title block: three bordered fields (what this sheet is,
 * where you can go, the state of the shared demo) divided by medium rules.
 */
export async function TitleBlock() {
  let needsReview = 0;
  let changes = 0;
  let lastReset: string | null = null;
  let databaseDown = false;
  try {
    const db = await requestDb();
    const [summary, meta] = await Promise.all([getIssueSummary(db), getAppMeta(db)]);
    needsReview = summary.needsReviewReservations;
    changes = meta.mutationsSinceReset;
    lastReset = formatTimestamp(meta.lastResetAt);
  } catch (error) {
    console.error("TitleBlock: database unavailable", error);
    databaseDown = true;
  }

  const items: NavItem[] = [
    { href: "/schedule", match: "/schedule", label: "Schedule" },
    { href: "/reservations/new", match: "/reservations", label: "New reservation" },
    {
      href: "/review", match: "/review", label: "Review",
      badge: needsReview > 0 ? <RevisionTriangle count={needsReview} size={20} label={`${needsReview} reservations need review`} /> : undefined,
    },
    { href: "/vessels", match: "/vessels", label: "Vessels" },
    { href: "/about", match: "/about", label: "About" },
  ];

  return (
    <header className="border-b-[1.5px] border-ink bg-sheet-sunk">
      <div className="grid grid-cols-1 divide-y divide-line-strong lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:divide-x lg:divide-y-0">
        <Link href="/schedule" className="flex flex-col justify-center px-4 py-3 lg:px-5">
          <span className="t-caption">Harborview Marine Research Center</span>
          <span className="text-[1.25rem] font-semibold leading-tight tracking-[-0.005em]">Dock Schedule</span>
        </Link>
        <nav aria-label="Main" className="min-h-12 px-1 lg:px-2">
          <NavLinks items={items} />
        </nav>
        <div className="px-4 py-2.5 lg:px-5">
          {databaseDown ? (
            <p className="text-[0.875rem] font-medium text-revision">The database is not reachable right now. Reload in a moment.</p>
          ) : (
            <DemoStatus changes={changes} lastReset={lastReset} />
          )}
        </div>
      </div>
    </header>
  );
}
