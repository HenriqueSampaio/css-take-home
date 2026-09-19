"use server";

import { runAction } from "./internal/run";
import { createBerth, restoreBerth, retireBerth, updateBerth, type BerthRef, type CreateBerthInput, type UpdateBerthInput } from "../services/berths";
import type { ServiceResult } from "../services/result";

export async function createBerthAction(input: CreateBerthInput): Promise<ServiceResult<{ id: string }>> {
  return runAction("createBerthAction", (db) => createBerth(db, input));
}

export async function updateBerthAction(input: UpdateBerthInput): Promise<ServiceResult<{ id: string; version: number }>> {
  return runAction("updateBerthAction", (db) => updateBerth(db, input));
}

export async function retireBerthAction(input: BerthRef): Promise<ServiceResult<{ id: string; version: number }>> {
  return runAction("retireBerthAction", (db) => retireBerth(db, input));
}

export async function restoreBerthAction(input: BerthRef): Promise<ServiceResult<{ id: string; version: number }>> {
  return runAction("restoreBerthAction", (db) => restoreBerth(db, input));
}
