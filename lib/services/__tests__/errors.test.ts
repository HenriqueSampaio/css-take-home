import { beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { reservations, vessels } from "../../db/schema";
import type { Db } from "../../db/types";
import { isConnectionError, pgErrorOf, resultFromError, rootCauseMessage, runService, WAKING_UP_MESSAGE } from "../errors";
import { failure } from "../result";
import { createTestDb, seedFixture } from "./helpers";

let db: Db;

beforeAll(async () => {
  ({ db } = await createTestDb());
  await seedFixture(db);
}, 60_000);

const caught = async (work: () => Promise<unknown>): Promise<unknown> => work().then(() => { throw new Error("expected a rejection"); }, (e: unknown) => e);

describe("pgErrorOf", () => {
  it("finds the SQLSTATE and constraint under Drizzle's wrapper, on a real exclusion violation", async () => {
    const error = await caught(() =>
      db.insert(reservations).values({ id: "x1", berthId: "south-float-east", kind: "vessel", vesselId: "v_tidewater", startDate: "2017-07-18", endDate: "2017-07-19" }),
    );
    // The thing we catch carries no code itself: that is the whole reason pgErrorOf exists.
    expect((error as { code?: string }).code).toBeUndefined();
    expect((error as Error).message).toMatch(/^Failed query/);
    expect(pgErrorOf(error)).toEqual({
      code: "23P01",
      constraint: "reservations_no_double_booking",
      message: expect.stringContaining("violates exclusion constraint"),
    });
    expect(rootCauseMessage(error)).toContain("violates exclusion constraint");
  });

  it("reads unique, foreign key and check violations the same way", async () => {
    const unique = await caught(() => db.insert(vessels).values({ id: "v_dupe", name: "Tidewater", nameKey: "TIDEWATER" }));
    expect(pgErrorOf(unique)).toMatchObject({ code: "23505", constraint: "vessels_name_key_unique" });

    const foreignKey = await caught(() => db.insert(reservations).values({ id: "x2", berthId: "nowhere", kind: "event", title: "T", startDate: "2020-01-01", endDate: "2020-01-02" }));
    expect(pgErrorOf(foreignKey)?.code).toBe("23503");

    const check = await caught(() => db.insert(reservations).values({ id: "x3", berthId: "inner-channel", kind: "event", title: "T", startDate: "2020-01-05", endDate: "2020-01-02" }));
    expect(pgErrorOf(check)).toMatchObject({ code: "23514", constraint: "reservations_dates_ck" });
  });

  it("walks nested causes, prefers a SQLSTATE over a socket code, and returns null when there is nothing", () => {
    const nested = new Error("outer", { cause: new Error("middle", { cause: Object.assign(new Error("inner"), { code: "23P01", constraint: "c" }) }) });
    expect(pgErrorOf(nested)).toEqual({ code: "23P01", constraint: "c", message: "inner" });

    const mixed = Object.assign(new Error("socket"), { code: "ECONNRESET", cause: Object.assign(new Error("pg"), { code: "57P01" }) });
    expect(pgErrorOf(mixed)?.code).toBe("57P01");
    expect(pgErrorOf(Object.assign(new Error("socket"), { code: "ECONNRESET" }))?.code).toBe("ECONNRESET");

    expect(pgErrorOf(new Error("plain"))).toBeNull();
    expect(pgErrorOf("a string")).toBeNull();
    expect(pgErrorOf(null)).toBeNull();
    const loop: { cause?: unknown } = {};
    loop.cause = loop;
    expect(pgErrorOf(loop)).toBeNull();
  });
});

describe("resultFromError", () => {
  it("maps each expected database error to its result code", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const pg = (code: string, constraint?: string) => new Error("Failed query: ...", { cause: Object.assign(new Error("db says no"), { code, constraint }) });
    expect(resultFromError(pg("23P01"), "t")).toMatchObject({ code: "CONFLICT", conflicts: [] });
    expect(resultFromError(pg("23505", "vessels_name_key_unique"), "t")).toMatchObject({ code: "VALIDATION", message: "A vessel with that name already exists." });
    expect(resultFromError(pg("23503"), "t").code).toBe("NOT_FOUND");
    expect(resultFromError(pg("23514"), "t").code).toBe("VALIDATION");
    expect(resultFromError(new Error("boom"), "t").code).toBe("INTERNAL");
    vi.restoreAllMocks();
  });

  it("tells the coordinator the database is waking up on connection trouble", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const samples = [
      new Error("Failed query", { cause: Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" }) }),
      Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
      new Error("timeout exceeded when trying to connect"),
      new Error("Connection terminated unexpectedly"),
      new Error("Failed query", { cause: Object.assign(new Error("bad connection"), { code: "08006" }) }),
    ];
    for (const sample of samples) {
      expect(isConnectionError(sample)).toBe(true);
      expect(resultFromError(sample, "t")).toEqual({ ok: false, code: "INTERNAL", message: WAKING_UP_MESSAGE });
    }
    vi.restoreAllMocks();
  });

  it("is not fooled by the word timeout inside the echoed query parameters", () => {
    const wrapper = Object.assign(new Error("Failed query: insert ...\nparams: crew timeout at noon"), { query: "insert ...", params: ["crew timeout at noon"] });
    wrapper.cause = Object.assign(new Error("conflicting key value violates exclusion constraint"), { code: "23P01", severity: "ERROR" });
    expect(isConnectionError(wrapper)).toBe(false);
    expect(resultFromError(wrapper, "t").code).toBe("CONFLICT");
  });

  it("turns a ZodError into VALIDATION with dotted field paths", () => {
    const schema = z.object({ name: z.string().min(1, { error: "Enter a name." }), newVessel: z.object({ lengthFt: z.number({ error: "Enter a length." }) }) });
    const parsed = schema.safeParse({ name: "", newVessel: { lengthFt: "long" } });
    expect(parsed.success).toBe(false);
    expect(resultFromError(parsed.error, "t")).toEqual({
      ok: false,
      code: "VALIDATION",
      message: "Enter a name.",
      fieldErrors: { name: ["Enter a name."], "newVessel.lengthFt": ["Enter a length."] },
    });
  });
});

describe("runService", () => {
  it("returns failures as values, including ones thrown to roll back, and never rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { abort } = await import("../errors");
    await expect(runService("t", async () => abort(failure("STALE", "changed")))).resolves.toEqual({ ok: false, code: "STALE", message: "changed" });
    await expect(runService("t", async () => { throw new Error("boom"); })).resolves.toMatchObject({ ok: false, code: "INTERNAL" });
    expect(console.error).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
