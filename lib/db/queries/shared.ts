/**
 * Small pieces every read query shares: how a reservation is named on screen,
 * and how driver-specific values become plain serialisable ones (query results
 * cross the server/client boundary as props, so no Date objects leave this layer).
 */
import { displayVesselName } from "../../domain/names";

export type ReservationStatus = "confirmed" | "needs_review" | "cancelled";

/** What to call a vessel in a sentence or a list: `R/V Golden Compass`. */
export const vesselLabel = (vessel: { prefix: string | null; name: string }): string => displayVesselName(vessel.prefix, vessel.name);

/**
 * The one display name for a reservation: the vessel for vessel stays, the title
 * for events and closures. The legacy label is only a last resort, for rows whose
 * subject went missing, so the UI never renders an empty bar.
 */
export function reservationLabel(row: {
  kind: "vessel" | "event" | "closure";
  title: string | null;
  rawLabel?: string | null;
  vesselName: string | null;
  vesselPrefix: string | null;
}): string {
  if (row.kind === "vessel" && row.vesselName) return displayVesselName(row.vesselPrefix, row.vesselName);
  return row.title?.trim() || row.rawLabel?.trim() || (row.kind === "closure" ? "Closure" : row.kind === "event" ? "Event" : "Unnamed vessel");
}

/** Timestamps leave as ISO strings. Drizzle hands back Date objects; raw `execute()` rows differ by driver. */
export function isoTimestamp(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  // Postgres text form is `2026-09-19 16:20:48.397-05`: make the separator and the offset ISO before parsing.
  const parsed = new Date(value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

/** `db.execute()` returns `{ rows }` on both node-postgres and PGlite, but the shared supertype cannot say so. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

/** Escapes `%`, `_` and `\` so user text is matched literally inside an ILIKE pattern. */
export const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (ch) => "\\" + ch);

export type Page = { limit?: number; offset?: number };

export function pageOf(opts: Page | undefined, defaultLimit: number, maxLimit = 500): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Math.trunc(opts?.limit ?? defaultLimit) || defaultLimit, 1), maxLimit);
  const offset = Math.max(Math.trunc(opts?.offset ?? 0) || 0, 0);
  return { limit, offset };
}
