/**
 * The shape every server action shares. Deliberately NOT a "use server" file and
 * kept out of lib/actions/*.ts: everything exported from a "use server" file
 * becomes a public endpoint, and this helper must never be one.
 *
 * Actions RETURN their ServiceResult and never redirect: the form that called
 * them decides what to do next (close a dialog, show the conflict inline,
 * navigate). On success the whole app is revalidated, because one booking
 * changes the month grid, the berth finder, the issue counts and the vessel
 * pages at once, and Next then ships the re-rendered route in the same response.
 */
import { revalidatePath } from "next/cache";
import { getDb } from "../../db/client";
import type { Db } from "../../db/types";
import { resultFromError } from "../../services/errors";
import type { ServiceResult } from "../../services/result";

export async function runAction<T>(name: string, work: (db: Db) => Promise<ServiceResult<T>>): Promise<ServiceResult<T>> {
  try {
    // getDb() is inside the try: a missing DATABASE_URL must come back as a result too, not as a masked 500.
    const result = await work(getDb());
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch (error) {
    return resultFromError(error, name);
  }
}
