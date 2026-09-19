"use server";

import { runAction } from "./internal/run";
import {
  cancelReservation, createReservation, restoreReservation, updateReservation,
  type CreateReservationInput, type ReservationRef, type UpdateReservationInput,
} from "../services/reservations";
import type { ServiceResult } from "../services/result";

export async function createReservationAction(input: CreateReservationInput): Promise<ServiceResult<{ id: string }>> {
  return runAction("createReservationAction", (db) => createReservation(db, input));
}

export async function updateReservationAction(input: UpdateReservationInput): Promise<ServiceResult<ReservationRef>> {
  return runAction("updateReservationAction", (db) => updateReservation(db, input));
}

export async function cancelReservationAction(input: ReservationRef): Promise<ServiceResult<ReservationRef>> {
  return runAction("cancelReservationAction", (db) => cancelReservation(db, input));
}

export async function restoreReservationAction(input: ReservationRef): Promise<ServiceResult<ReservationRef>> {
  return runAction("restoreReservationAction", (db) => restoreReservation(db, input));
}
