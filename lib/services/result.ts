/**
 * The one shape every service and server action returns.
 *
 * Expected failures (a taken berth, a vessel that is too long, a stale edit) are
 * VALUES, not exceptions: Next.js replaces the message of anything thrown from a
 * server action with a generic one in production, which would hide exactly the
 * sentence the coordinator needs to read.
 */
import type { ISODate } from "../domain/dates";

/** A booking that is in the way. `confirmed` blocks; `needs_review` is only a caution. */
export type ConflictInfo = {
  id: string;
  label: string;
  startDate: ISODate;
  endDate: ISODate;
  status: "confirmed" | "needs_review";
};

export type FitFailure = { vesselFt: number; berthFt: number; overByFt: number };

export type ServiceErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TOO_LONG"
  | "LENGTH_REQUIRED"
  | "STALE"
  | "INVALID_STATE"
  | "COOLDOWN"
  | "INTERNAL";

export type ServiceFailure = {
  ok: false;
  code: ServiceErrorCode;
  /** One or two plain sentences, safe to show to a dock coordinator as is. */
  message: string;
  /** Keyed by input field (nested fields use dots: `newVessel.lengthFt`); `_form` when no field applies. */
  fieldErrors?: Record<string, string[]>;
  /** CONFLICT only: the confirmed bookings in the way. */
  conflicts?: ConflictInfo[];
  /** TOO_LONG only. */
  fit?: FitFailure;
  /** COOLDOWN only: whole seconds until a reset is allowed again. */
  retryAfterSeconds?: number;
};

export type ServiceSuccess<T> = {
  ok: true;
  data: T;
  /** The change was saved, but the coordinator should know something (an unresolved legacy overlap, a misfit). */
  warning?: string;
};

export type ServiceResult<T> = ServiceSuccess<T> | ServiceFailure;

export const ok = <T>(data: T, warning?: string): ServiceSuccess<T> => (warning ? { ok: true, data, warning } : { ok: true, data });

export const failure = (code: ServiceErrorCode, message: string, extra: Omit<ServiceFailure, "ok" | "code" | "message"> = {}): ServiceFailure => ({
  ok: false,
  code,
  message,
  ...extra,
});

/** VALIDATION failure pinned to one input field. */
export const invalid = (field: string, message: string): ServiceFailure => failure("VALIDATION", message, { fieldErrors: { [field]: [message] } });
