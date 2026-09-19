/**
 * The seed contract: the ONLY coupling between the legacy importer and the app.
 *
 * `npm run import` turns the workbook into these JSON files (committed under
 * `data/seed/`); `npm run db:seed` and the in-app "Reset demo data" action load
 * them into Postgres. Either side can change freely as long as this file and
 * `validateSeed()` still hold.
 */
import type { ISODate } from "../domain/dates";
import type { LengthStatus } from "../domain/fit";

export const SEED_SCHEMA_VERSION = 1;

/** The six length-bearing berths, identical in all 23 year sheets. Ids are fixed slugs. */
export const BERTH_IDS = [
  "north-pier-west",
  "north-pier-face",
  "north-pier-east",
  "inner-channel",
  "south-float-west",
  "south-float-east",
] as const;
export type BerthId = (typeof BERTH_IDS)[number];

export type BerthSeed = {
  id: BerthId;
  name: string;
  lengthFt: number;
  sortOrder: number;
};

export type VesselSeed = {
  /** `v_` + slug of `nameKey`. */
  id: string;
  /** Display name without prefix, e.g. `Golden Compass`. */
  name: string;
  /** Identity: uppercased name without prefix. Unique. */
  nameKey: string;
  /** Most common prefix seen in the schedule (display only), e.g. `R/V`. */
  prefix: string | null;
  /** Set only when `lengthStatus` is `verified` or `probable`. */
  lengthFt: number | null;
  lengthStatus: LengthStatus;
  /** Every length the registry offered; more than one distinct value means `conflict`. */
  lengthCandidates: number[];
  /** Human-readable provenance, e.g. `Yachts!A49 "M/Y Far Horizon 170'" (name match, different prefix)`. */
  lengthEvidence: string | null;
  /** `grid` = appears in the schedule; `registry` = only in the Science/Yachts lists. */
  origin: "grid" | "registry";
};

export type ReservationKind = "vessel" | "event" | "closure";
export type SeedReservationStatus = "confirmed" | "needs_review";

export type ReservationSeed = {
  /** `r_` + first 10 hex chars of sha256(first source run + '#' + index among rows sharing that run). */
  id: string;
  berthId: BerthId;
  kind: ReservationKind;
  /** Required when kind is `vessel`, otherwise null. */
  vesselId: string | null;
  /** Required when kind is not `vessel`, otherwise null. */
  title: string | null;
  startDate: ISODate;
  /** Inclusive. */
  endDate: ISODate;
  status: SeedReservationStatus;
  /** Operational notes lifted from the grid ("ETA 1200", "Fueling @0800"), newline-separated. */
  notes: string;
  /** The label exactly as written in the workbook, when there was one. */
  rawLabel: string | null;
  /** Source cells: `run(;run)*`, run = `<sheet>!<A1>[:<A1>]`, e.g. `2019!F42:AJ42;2019!B58:D58`. */
  sourceRef: string;
};

export const ISSUE_TYPES = ["overlap", "unlabelled", "calendar_defect", "ambiguous_extent", "length_conflict"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

/** `blocking` issues put their reservation in `needs_review`; `warning` issues ride on a confirmed row. */
export type IssueSeverity = "blocking" | "warning";

export type IssueSeed = {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  /** Finer-grained cause, e.g. `shared_bar`, `label_unfilled`, `merge_past_month_end`, `unknown_label`. */
  reason: string | null;
  reservationId: string | null;
  vesselId: string | null;
  /** The other party/parties, e.g. the reservation this one collides with. */
  relatedReservationIds: string[];
  /** One sentence a dock coordinator can act on. */
  detail: string;
  sourceRef: string | null;
};

export type Seed = {
  berths: BerthSeed[];
  vessels: VesselSeed[];
  reservations: ReservationSeed[];
  issues: IssueSeed[];
};

/** Issue types that force `needs_review`. Everything else is a warning on a confirmed row. */
export const BLOCKING_ISSUE_TYPES: ReadonlySet<IssueType> = new Set(["overlap", "unlabelled", "calendar_defect"]);
