"use server";

import { runAction } from "./internal/run";
import type { ServiceResult } from "../services/result";
import { createVessel, updateVessel, type CreateVesselInput, type UpdateVesselInput } from "../services/vessels";

export async function createVesselAction(input: CreateVesselInput): Promise<ServiceResult<{ id: string }>> {
  return runAction("createVesselAction", (db) => createVessel(db, input));
}

export async function updateVesselAction(input: UpdateVesselInput): Promise<ServiceResult<{ id: string; version: number }>> {
  return runAction("updateVesselAction", (db) => updateVessel(db, input));
}
