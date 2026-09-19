import { asc } from "drizzle-orm";
import { berths } from "../schema";
import type { Db } from "../types";

export type BerthRow = { id: string; name: string; lengthFt: number; sortOrder: number };

/** The six berths in dock order (north to south), as the legacy grid listed them. */
export function getBerths(db: Db): Promise<BerthRow[]> {
  return db
    .select({ id: berths.id, name: berths.name, lengthFt: berths.lengthFt, sortOrder: berths.sortOrder })
    .from(berths)
    .orderBy(asc(berths.sortOrder), asc(berths.name));
}
