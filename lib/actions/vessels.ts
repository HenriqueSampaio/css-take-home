"use server";

import { runAction } from "./internal/run";
import type { ServiceResult } from "../services/result";
import { createVessel, setVesselLength, type CreateVesselInput, type SetVesselLengthInput } from "../services/vessels";

export async function setVesselLengthAction(input: SetVesselLengthInput): Promise<ServiceResult<{ misfitsBefore: number; misfitsAfter: number }>> {
  return runAction("setVesselLengthAction", (db) => setVesselLength(db, input));
}

export async function createVesselAction(input: CreateVesselInput): Promise<ServiceResult<{ id: string }>> {
  return runAction("createVesselAction", (db) => createVessel(db, input));
}
