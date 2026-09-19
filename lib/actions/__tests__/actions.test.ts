/**
 * The actions are thin, so this only checks the wiring: results pass through
 * untouched, a success revalidates the whole app, a failure does not, and
 * nothing is ever thrown at the client. next/cache and the production database
 * handle are replaced; the services underneath run for real against PGlite.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../../db/types";
import { createTestDb, expectFail, expectOk, seedFixture } from "../../services/__tests__/helpers";

const mocks = vi.hoisted(() => ({ revalidatePath: vi.fn(), getDb: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../db/client", () => ({ getDb: mocks.getDb }));

import { resetDemoDataAction } from "../demo";
import { cancelReservationAction, confirmReservationAction, createReservationAction, updateReservationAction } from "../reservations";
import { createVesselAction, setVesselLengthAction } from "../vessels";

let db: Db;

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
    const created = expectOk(await createReservationAction({ kind: "vessel", berthId: "south-float-east", vesselId: "v_tidewater", startDate: "2019-09-02", endDate: "2019-09-04" }));
    expect(mocks.revalidatePath).toHaveBeenLastCalledWith("/", "layout");

    const updated = expectOk(await updateReservationAction({ id: created.data.id, version: 1, berthId: "south-float-east", startDate: "2019-09-02", endDate: "2019-09-05" }));
    const cancelled = expectOk(await cancelReservationAction(updated.data));
    expectOk(await confirmReservationAction(cancelled.data));
    expectOk(await setVesselLengthAction({ vesselId: "v_long-ketch", version: 1, lengthFt: 45 }));
    expectOk(await createVesselAction({ name: "R/V Kittiwake", lengthFt: 52 }));
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(6);
  });

  it("return failures as values without revalidating", async () => {
    const conflict = expectFail(await createReservationAction({ kind: "vessel", berthId: "south-float-east", vesselId: "v_tidewater", startDate: "2017-07-15", endDate: "2017-07-20" }));
    expect(conflict.code).toBe("CONFLICT");
    expect(conflict.conflicts?.[0].label).toBe("OSV Amber Reef");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("turn a missing database configuration into INTERNAL instead of throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getDb.mockImplementation(() => {
      throw new Error("DATABASE_URL is not set.");
    });
    const failed = expectFail(await cancelReservationAction({ id: "r_fx_pair_a", version: 1 }));
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
