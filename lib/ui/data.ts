import { connection } from "next/server";
import { getDb } from "@/lib/db/client";
import type { Db } from "@/lib/db/types";

/**
 * The database handle for a page or layout. Awaiting `connection()` first tells Next.js
 * this work belongs to a request, so a schedule is never prerendered at build time and
 * then served stale. (The root layout also exports `dynamic = "force-dynamic"`.)
 */
export async function requestDb(): Promise<Db> {
  await connection();
  return getDb();
}

/** "Sep 19, 2026, 5:42 PM" in the facility's time zone, from an ISO timestamp. */
export function formatTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
