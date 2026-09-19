/**
 * GET /api/health: is the deployment actually wired up? Answers with row
 * counts, whether btree_gist and the double-booking constraint exist (i.e. the
 * hand-written migration ran), and which seed is loaded. 200 when the database
 * answers, 503 when it does not.
 */
import { connection } from "next/server";
import { getDb } from "@/lib/db/client";
import { getHealth } from "@/lib/db/queries/meta";
import { pgErrorOf } from "@/lib/services/errors";

// A cached health check is worse than none. GET handlers already run per request
// by default, but that default differs between Next's two caching models and the
// `dynamic = "force-dynamic"` segment option is an error once Cache Components is
// enabled. `connection()` is the one opt-out that is valid under both: nothing
// after it can run during a build or be prerendered. `no-store` tells any CDN or
// browser in front of the function the same thing.
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET(): Promise<Response> {
  await connection();
  try {
    const health = await getHealth(getDb());
    return Response.json({ ok: true, ...health }, { status: 200, headers: NO_STORE });
  } catch (error) {
    // The full error goes to the server log only. Driver messages can name the database host
    // ("getaddrinfo ENOTFOUND ep-...") or role ("password authentication failed for user ..."),
    // and this endpoint is public, so the body carries a coarse category and nothing else.
    console.error("[health] database check failed", error);
    const code = pgErrorOf(error)?.code ?? null;
    const category = code === "42P01" ? "schema missing" : code?.startsWith("28") ? "authentication failed" : "database unreachable";
    return Response.json({ ok: false, error: category, code }, { status: 503, headers: NO_STORE });
  }
}
