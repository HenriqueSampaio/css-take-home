/**
 * "Reset demo data": replaces everything with the imported legacy seed.
 *
 * One transaction from the advisory lock to the app_meta upsert, so a failure
 * at any row leaves the previous data exactly as it was; a reviewer can never
 * land on a half-empty schedule. Used by the in-app reset action (with a
 * cooldown, because the demo is shared and public) and by `npm run db:seed`
 * (without one).
 */
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { appMeta, berths, issues, reservations, vessels } from "../db/schema";
import type { Db, Tx } from "../db/types";
import { SEED_SCHEMA_VERSION, type Seed } from "../seed/contract";
import { assertValidSeed } from "../seed/validate";
import { abort, runService } from "./errors";
import { MESSAGES } from "./messages";
import { failure, ok, type ServiceResult } from "./result";

export type ResetOptions = {
  /** Minimum seconds between resets. Default 30; 0 disables the check (CLI seeding). */
  cooldownSeconds?: number;
  /** Stored in app_meta. Defaults to a fingerprint of the seed's content. */
  seedVersion?: string;
  /** Tests only: load a deliberately broken seed to prove the rollback. */
  skipValidation?: boolean;
};

export type ResetSummary = { berths: number; vessels: number; reservations: number; issues: number; seedVersion: string };

export const DEFAULT_RESET_COOLDOWN_SECONDS = 30;
/** Arbitrary but fixed: every reset, from any process, queues on this one advisory lock. */
const RESET_LOCK_KEY = 7411;
/** 500 reservations x 12 columns stays far below Postgres's 65535 bind-parameter limit. */
const CHUNK_ROWS = 500;

/** Same seed, same version, on any machine: lets /api/health show whether the deployed data matches the repo. */
export function seedFingerprint(seed: Seed): string {
  const hash = createHash("sha256").update(JSON.stringify([seed.berths, seed.vessels, seed.reservations, seed.issues])).digest("hex");
  return `s${SEED_SCHEMA_VERSION}-${hash.slice(0, 12)}`;
}

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
    // Before any SQL: I5 in the validator mirrors the exclusion constraint, so a seed that passes cannot be rejected halfway.
    if (!opts.skipValidation) {
      try {
        assertValidSeed(seed);
      } catch (error) {
        console.error("[resetFromSeed] seed rejected", error);
        return failure("INTERNAL", "The demo data files did not pass their checks, so nothing was changed.");
      }
    }
    const cooldown = opts.cooldownSeconds ?? DEFAULT_RESET_COOLDOWN_SECONDS;
    const seedVersion = opts.seedVersion ?? seedFingerprint(seed);

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

      await tx.execute(sql`truncate table issues, reservations, vessels, berths restart identity cascade`);

      await inChunks(seed.berths, (chunk) => tx.insert(berths).values(chunk));
      await inChunks(seed.vessels, (chunk) => tx.insert(vessels).values(chunk));
      await inChunks(seed.reservations, (chunk) => tx.insert(reservations).values(chunk.map((r) => ({ ...r, source: "legacy" as const }))));
      await inChunks(seed.issues, (chunk) => tx.insert(issues).values(chunk));

      await tx
        .insert(appMeta)
        .values({ id: true, seedVersion, lastResetAt: sql`now()`, mutationsSinceReset: 0 })
        .onConflictDoUpdate({ target: appMeta.id, set: { seedVersion, lastResetAt: sql`now()`, mutationsSinceReset: 0 } });

      return ok({
        berths: seed.berths.length,
        vessels: seed.vessels.length,
        reservations: seed.reservations.length,
        issues: seed.issues.length,
        seedVersion,
      });
    });
  });
}
