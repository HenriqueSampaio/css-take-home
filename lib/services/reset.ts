/**
 * "Reset demo data": back to the starting state, which is the berths, the
 * vessel registry and an EMPTY schedule (the system books from today onwards,
 * so there is nothing to seed it with).
 *
 * One transaction from the advisory lock to the app_meta upsert, so a failure
 * at any row leaves the previous data exactly as it was; a reviewer can never
 * land on a half-empty dock. Used by the in-app reset action (with a cooldown,
 * because the demo is shared and public) and by `npm run db:seed` (without one).
 */
import { eq, sql } from "drizzle-orm";
import { appMeta, berths, vessels } from "../db/schema";
import type { Db, Tx } from "../db/types";
import type { Seed } from "../seed/contract";
import { assertValidSeed } from "../seed/validate";
import { abort, runService } from "./errors";
import { MESSAGES } from "./messages";
import { failure, ok, type ServiceResult } from "./result";

export type ResetOptions = {
  /** Minimum seconds between resets. Default 30; 0 disables the check (CLI seeding, tests). */
  cooldownSeconds?: number;
};

export type ResetSummary = { berths: number; vessels: number };

export const DEFAULT_RESET_COOLDOWN_SECONDS = 30;
/** Arbitrary but fixed: every reset, from any process, queues on this one advisory lock. */
const RESET_LOCK_KEY = 7411;
/** 500 rows of at most 8 columns stays far below Postgres's 65535 bind-parameter limit. */
const CHUNK_ROWS = 500;

async function inChunks<T>(rows: readonly T[], insert: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK_ROWS) await insert(rows.slice(i, i + CHUNK_ROWS));
}

async function secondsSinceLastReset(tx: Tx): Promise<number | null> {
  // Measured on the database clock, the same clock that writes last_reset_at, so server clock skew cannot matter.
  const [row] = await tx
    .select({ elapsed: sql<number | null>`extract(epoch from (now() - ${appMeta.lastResetAt}))`.mapWith(Number) })
    .from(appMeta)
    .where(eq(appMeta.id, true))
    .limit(1);
  return row?.elapsed ?? null;
}

export function resetFromSeed(db: Db, seed: Seed, opts: ResetOptions = {}): Promise<ServiceResult<ResetSummary>> {
  return runService("resetFromSeed", async () => {
    // Before any SQL: the validator mirrors the database's rules, so a seed that passes is not expected to be rejected halfway.
    try {
      assertValidSeed(seed);
    } catch (error) {
      console.error("[resetFromSeed] seed rejected", error);
      return failure("INTERNAL", "The demo data files did not pass their checks, so nothing was changed.");
    }
    const cooldown = opts.cooldownSeconds ?? DEFAULT_RESET_COOLDOWN_SECONDS;

    return db.transaction(async (tx) => {
      // Two people pressing Reset together run one after the other; the second then meets the cooldown.
      await tx.execute(sql`select pg_advisory_xact_lock(${RESET_LOCK_KEY}::bigint)`);

      if (cooldown > 0) {
        const elapsed = await secondsSinceLastReset(tx);
        if (elapsed !== null && elapsed < cooldown) {
          const retryAfterSeconds = Math.max(1, Math.ceil(cooldown - elapsed));
          abort(failure("COOLDOWN", MESSAGES.cooldown(retryAfterSeconds), { retryAfterSeconds }));
        }
      }

      // All three in one statement: they reference each other, and TRUNCATE refuses a table whose referrers are left out.
      await tx.execute(sql`truncate table reservations, vessels, berths`);

      await inChunks(seed.berths, (chunk) => tx.insert(berths).values(chunk));
      await inChunks(seed.vessels, (chunk) => tx.insert(vessels).values(chunk));

      await tx
        .insert(appMeta)
        .values({ id: true, lastResetAt: sql`now()`, mutationsSinceReset: 0 })
        .onConflictDoUpdate({ target: appMeta.id, set: { lastResetAt: sql`now()`, mutationsSinceReset: 0 } });

      return ok({ berths: seed.berths.length, vessels: seed.vessels.length });
    });
  });
}
