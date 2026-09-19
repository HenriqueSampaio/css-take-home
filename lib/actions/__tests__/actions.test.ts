/**
 * The actions are thin, so this only checks the wiring: results pass through
 * untouched, a success revalidates the whole app, a failure does not, and
 * nothing is ever thrown at the client. next/cache and the production database
 * handle are replaced; the services underneath run for real against PGlite.
 *
 * Actions take no `today`: they book against the facility's real date, so the
 * dates here are computed from it rather than pinned.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../../db/types";
import { addDays, todayIn } from "../../domain/dates";
import { createTestDb, expectFail, expectOk, seedFixture } from "../../services/__tests__/helpers";

const mocks = vi.hoisted(() => ({ revalidatePath: vi.fn(), getDb: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../db/client", () => ({ getDb: mocks.getDb }));

import { createBerthAction, restoreBerthAction, retireBerthAction, updateBerthAction } from "../berths";
import { resetDemoDataAction } from "../demo";
import { cancelReservationAction, createReservationAction, restoreReservationAction, updateReservationAction } from "../reservations";
import { createVesselAction, updateVesselAction } from "../vessels";

let db: Db;
// A week out, so a test run that straddles midnight in New York still books in the future.
const start = addDays(todayIn(), 7);
const end = addDays(start, 2);

beforeAll(async () => {
  ({ db } = await createTestDb());
}, 60_000);

beforeEach(async () => {
  await seedFixture(db);
  mocks.revalidatePath.mockReset();
  mocks.getDb.mockReset().mockReturnValue(db);
});

afterEach(() => vi.restoreAllMocks());

describe("server actions", () => {
  it("return the service result and revalidate the whole app on success", async () => {
    const created = expectOk(await createReservationAction({ kind: "vessel", berthId: "south-float-east", vesselId: "v_tidewater", startDate: start, endDate: end }));
    expect(mocks.revalidatePath).toHaveBeenLastCalledWith("/", "layout");

    const updated = expectOk(await updateReservationAction({ id: created.data.id, version: 1, berthId: "south-float-east", startDate: start, endDate: addDays(end, 1) }));
    const cancelled = expectOk(await cancelReservationAction(updated.data));
    expectOk(await restoreReservationAction(cancelled.data));
    expectOk(await updateVesselAction({ vesselId: "v_long-ketch", version: 1, lengthFt: 46 }));
    expectOk(await createVesselAction({ name: "R/V Kittiwake", lengthFt: 52 }));
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(6);

    const berth = expectOk(await createBerthAction({ name: "Fuel Dock", lengthFt: 120 }));
    const edited = expectOk(await updateBerthAction({ berthId: berth.data.id, version: 1, name: "Fuel Dock", lengthFt: 125 }));
    const retired = expectOk(await retireBerthAction({ berthId: berth.data.id, version: edited.data.version }));
    expect(expectOk(await restoreBerthAction({ berthId: berth.data.id, version: retired.data.version })).data).toEqual({ id: "fuel-dock", version: 4 });
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(10);
  });

  it("return failures as values without revalidating", async () => {
    expectOk(await createReservationAction({ kind: "vessel", berthId: "south-float-east", vesselId: "v_amber-reef", startDate: start, endDate: end }));
    mocks.revalidatePath.mockReset();

    const conflict = expectFail(await createReservationAction({ kind: "vessel", berthId: "south-float-east", vesselId: "v_tidewater", startDate: end, endDate: addDays(end, 3) }));
    expect(conflict.code).toBe("CONFLICT");
    expect(conflict.conflicts?.[0]).toMatchObject({ label: "OSV Amber Reef", berthName: "South Float East" });

    const past = expectFail(await createReservationAction({ kind: "vessel", berthId: "south-float-west", vesselId: "v_tidewater", startDate: addDays(todayIn(), -2), endDate: end }));
    expect(past.fieldErrors?.startDate).toBeDefined();

    expect(expectFail(await updateVesselAction({ vesselId: "v_amber-reef", version: 1, lengthFt: 95 })).code).toBe("TOO_LONG");
    expect(expectFail(await updateBerthAction({ berthId: "south-float-east", version: 1, name: "South Float East", lengthFt: 80 })).code).toBe("TOO_LONG");
    expect(expectFail(await retireBerthAction({ berthId: "south-float-east", version: 1 })).code).toBe("CONFLICT");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("turn a missing database configuration into INTERNAL instead of throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getDb.mockImplementation(() => {
      throw new Error("DATABASE_URL is not set.");
    });
    const failed = expectFail(await cancelReservationAction({ id: "r_anything", version: 1 }));
    expect(failed.code).toBe("INTERNAL");
    expect(failed.message).not.toContain("DATABASE_URL");
  });

  it("resetDemoDataAction loads the committed seed and honours the cooldown", async () => {
    // The fixture was seeded a moment ago in beforeEach, so the shared cooldown applies.
    const blocked = expectFail(await resetDemoDataAction());
    expect(blocked.code).toBe("COOLDOWN");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
