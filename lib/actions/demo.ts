"use server";

import { runAction } from "./internal/run";
import { loadSeed } from "../seed/load";
import { resetFromSeed, type ResetSummary } from "../services/reset";
import type { ServiceResult } from "../services/result";

/**
 * Puts the shared demo back to the imported legacy data. Takes no arguments on
 * purpose: this is a public endpoint, so the caller gets no say over which seed
 * is loaded or over the cooldown that stops it being hammered.
 */
export async function resetDemoDataAction(): Promise<ServiceResult<ResetSummary>> {
  return runAction("resetDemoDataAction", (db) => resetFromSeed(db, loadSeed()));
}
