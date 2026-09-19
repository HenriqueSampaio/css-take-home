/**
 * Turning whatever went wrong into a ServiceResult.
 *
 * Two jobs. First, reading Postgres errors: Drizzle wraps every driver error in
 * a DrizzleQueryError, so the SQLSTATE lives on `error.cause` (and node-postgres
 * sometimes nests once more), never on the error a service actually catches.
 * Second, giving services a way to abandon a transaction with a friendly result:
 * returning from `db.transaction()` COMMITS, so a failure found halfway through
 * (after a vessel length was already updated, say) must be thrown to roll back,
 * then unwrapped into a value again at the service boundary.
 */
import { ZodError } from "zod";
import { failure, type ServiceFailure, type ServiceResult } from "./result";

export type PgErrorInfo = { code: string; constraint: string | null; message: string };

const SQLSTATE_RE = /^[0-9A-Z]{5}$/;
const MAX_CAUSE_DEPTH = 8;

function* causeChain(error: unknown): Generator<Record<string, unknown>> {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && typeof current === "object" && current !== null; depth++) {
    yield current as Record<string, unknown>;
    current = (current as { cause?: unknown }).cause;
  }
}

/**
 * The database error inside `error`, however deeply it is wrapped, or null when
 * there is none. A real SQLSTATE wins over a Node socket code (`ECONNRESET`)
 * found higher up the chain.
 */
export function pgErrorOf(error: unknown): PgErrorInfo | null {
  let fallback: PgErrorInfo | null = null;
  for (const link of causeChain(error)) {
    if (typeof link.code !== "string") continue;
    const info: PgErrorInfo = {
      code: link.code,
      constraint: typeof link.constraint === "string" ? link.constraint : null,
      message: typeof link.message === "string" ? link.message : String(link.code),
    };
    if (SQLSTATE_RE.test(link.code)) return info;
    fallback ??= info;
  }
  return fallback;
}

/** The innermost message in the chain: the driver's own words rather than Drizzle's "Failed query: ..." wrapper. */
export function rootCauseMessage(error: unknown): string {
  let message = "Unknown error";
  for (const link of causeChain(error)) if (typeof link.message === "string" && link.message) message = link.message;
  return message;
}

export const EXCLUSION_VIOLATION = "23P01";
export const DEADLOCK_DETECTED = "40P01";
export const SERIALIZATION_FAILURE = "40001";
export const UNIQUE_VIOLATION = "23505";
export const FOREIGN_KEY_VIOLATION = "23503";
export const CHECK_VIOLATION = "23514";

/** SQLSTATE class 08 is "connection exception"; 57P0x are the server going away (Neon suspending a compute). */
const CONNECTION_SQLSTATES = new Set(["57P01", "57P02", "57P03"]);
const CONNECTION_NODE_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "ENOTFOUND", "EAI_AGAIN"]);
const CONNECTION_MESSAGE_RE = /timeout|timed out|connection terminated|connection ended|client has encountered a connection error|too many clients/i;

export function isConnectionError(error: unknown): boolean {
  for (const link of causeChain(error)) {
    const code = typeof link.code === "string" ? link.code : "";
    if (CONNECTION_SQLSTATES.has(code) || CONNECTION_NODE_CODES.has(code) || (SQLSTATE_RE.test(code) && code.startsWith("08"))) return true;
    // Drizzle's wrapper message echoes the query parameters, so a booking note saying "crew timeout" must not count.
    const isDrizzleWrapper = "query" in link && "params" in link && !("severity" in link);
    if (!isDrizzleWrapper && typeof link.message === "string" && CONNECTION_MESSAGE_RE.test(link.message)) return true;
  }
  return false;
}

/** Thrown inside a transaction to roll it back and surface `result` to the caller. Never escapes a service. */
export class ServiceAbort extends Error {
  constructor(readonly result: ServiceFailure) {
    super(result.message);
    this.name = "ServiceAbort";
  }
}

/** Roll back and fail. Typed `never` so control flow narrows after a guard. */
export function abort(result: ServiceFailure): never {
  throw new ServiceAbort(result);
}

/** Zod issues grouped by dotted field path, the shape forms want. */
export function fieldErrorsOf(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

export const WAKING_UP_MESSAGE = "The database is waking up. Please try again.";
const INTERNAL_MESSAGE = "Something went wrong on our side and nothing was saved. Please try again.";

/**
 * The catch-all mapping. Services handle the errors they can explain better
 * themselves (naming the blocking booking, naming the duplicate vessel) before
 * falling back to this.
 */
export function resultFromError(error: unknown, context: string): ServiceFailure {
  if (error instanceof ServiceAbort) return error.result;

  if (error instanceof ZodError) {
    const fieldErrors = fieldErrorsOf(error);
    const first = Object.values(fieldErrors)[0]?.[0];
    return failure("VALIDATION", first ?? "Some of the details entered are not valid.", { fieldErrors });
  }

  const pg = pgErrorOf(error);
  // An integrity violation (class 23) is a definite answer from a live database, so it is never a connection problem.
  if (!pg?.code.startsWith("23") && isConnectionError(error)) {
    console.error(`[${context}] database connection problem`, error);
    return failure("INTERNAL", WAKING_UP_MESSAGE);
  }

  switch (pg?.code) {
    case EXCLUSION_VIOLATION:
    // Two inserts colliding at the same instant can each wait on the other's in-progress row; Postgres then
    // aborts one as a deadlock (or a serialization failure) rather than an exclusion violation. Same outcome
    // for the coordinator: someone else got the berth.
    case DEADLOCK_DETECTED:
    case SERIALIZATION_FAILURE:
      return failure("CONFLICT", "That berth was just booked for overlapping dates by someone else. Pick different dates or another berth.", { conflicts: [] });
    // Class 22 (data exception), e.g. a NUL byte Postgres cannot store: the input is at fault, not the server.
    case "22021":
    case "22P05":
      return failure("VALIDATION", "Some of the text entered contains characters that cannot be saved. Remove them and try again.");
    case UNIQUE_VIOLATION:
      return failure(
        "VALIDATION",
        pg.constraint === "vessels_name_key_unique" ? "A vessel with that name already exists." : "That record already exists.",
      );
    case FOREIGN_KEY_VIOLATION:
      return failure("NOT_FOUND", "Something this booking refers to no longer exists. The demo data may have been reset.");
    case CHECK_VIOLATION:
      return failure("VALIDATION", "Those details are not allowed. Check the dates and the vessel length, then try again.");
  }

  console.error(`[${context}] unexpected error`, error);
  return failure("INTERNAL", INTERNAL_MESSAGE);
}

/** The boundary every service runs inside: nothing is ever thrown past it. */
export async function runService<T>(context: string, work: () => Promise<ServiceResult<T>>): Promise<ServiceResult<T>> {
  try {
    return await work();
  } catch (error) {
    return resultFromError(error, context);
  }
}
