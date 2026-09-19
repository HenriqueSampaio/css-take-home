/**
 * Database schema. Tables, enums, CHECKs and indexes live here and are turned
 * into SQL by `drizzle-kit generate`. The one thing Drizzle cannot express, the
 * exclusion constraint that makes double-booking impossible, lives in the
 * hand-written migration `drizzle/0001_constraints.sql`.
 *
 * Dates are `date` columns read and written as plain 'YYYY-MM-DD' strings.
 * Primary keys are text so legacy rows keep stable, meaningful ids across
 * re-imports and demo resets.
 */
import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const reservationKind = pgEnum("reservation_kind", ["vessel", "event", "closure"]);
export const reservationStatus = pgEnum("reservation_status", ["confirmed", "needs_review", "cancelled"]);
export const lengthStatus = pgEnum("length_status", ["verified", "probable", "conflict", "unknown"]);
export const recordSource = pgEnum("record_source", ["legacy", "app"]);
export const vesselOrigin = pgEnum("vessel_origin", ["grid", "registry", "app"]);

export const berths = pgTable(
  "berths",
  {
    id: text("id").primaryKey(), // slug, e.g. 'north-pier-west'
    name: text("name").notNull().unique(),
    lengthFt: integer("length_ft").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (t) => [check("berths_length_ck", sql`${t.lengthFt} > 0`)],
);

export const vessels = pgTable(
  "vessels",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(), // without type prefix
    nameKey: text("name_key").notNull().unique(), // identity: uppercased name
    prefix: text("prefix"), // display only: 'R/V', 'Tug', ...
    lengthFt: integer("length_ft"),
    lengthStatus: lengthStatus("length_status").notNull().default("unknown"),
    lengthCandidates: integer("length_candidates").array().notNull().default(sql`'{}'::integer[]`),
    lengthEvidence: text("length_evidence"),
    origin: vesselOrigin("origin").notNull().default("app"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("vessels_length_ck", sql`${t.lengthFt} IS NULL OR ${t.lengthFt} BETWEEN 1 AND 1500`),
    // A length is on file exactly when its status says we can use it.
    check("vessels_length_state_ck", sql`(${t.lengthFt} IS NOT NULL) = (${t.lengthStatus} IN ('verified', 'probable'))`),
  ],
);

export const reservations = pgTable(
  "reservations",
  {
    id: text("id").primaryKey(),
    berthId: text("berth_id").notNull().references(() => berths.id),
    kind: reservationKind("kind").notNull(),
    vesselId: text("vessel_id").references(() => vessels.id, { onDelete: "restrict" }),
    title: text("title"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(), // inclusive
    status: reservationStatus("status").notNull().default("confirmed"),
    notes: text("notes").notNull().default(""),
    source: recordSource("source").notNull().default("app"),
    sourceRef: text("source_ref"), // legacy rows: the workbook cells this came from
    rawLabel: text("raw_label"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    check("reservations_dates_ck", sql`${t.endDate} >= ${t.startDate}`),
    check(
      "reservations_subject_ck",
      sql`(${t.kind} = 'vessel' AND ${t.vesselId} IS NOT NULL) OR (${t.kind} <> 'vessel' AND ${t.vesselId} IS NULL AND ${t.title} IS NOT NULL)`,
    ),
    check("reservations_legacy_ref_ck", sql`${t.source} <> 'legacy' OR ${t.sourceRef} IS NOT NULL`),
    index("reservations_berth_start_idx").on(t.berthId, t.startDate),
    index("reservations_window_idx").on(t.endDate, t.startDate),
    index("reservations_vessel_idx").on(t.vesselId).where(sql`${t.vesselId} IS NOT NULL`),
    index("reservations_review_idx").on(t.startDate).where(sql`${t.status} = 'needs_review'`),
  ],
);

/** Findings from the legacy import only. Fit violations and live overlaps are computed at read time, never stored. */
export const issues = pgTable(
  "issues",
  {
    id: text("id").primaryKey(),
    reservationId: text("reservation_id").references(() => reservations.id, { onDelete: "cascade" }),
    vesselId: text("vessel_id").references(() => vessels.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // IssueType in lib/seed/contract.ts
    severity: text("severity").notNull(), // 'blocking' | 'warning'
    reason: text("reason"),
    detail: text("detail").notNull(),
    relatedReservationIds: text("related_reservation_ids").array().notNull().default(sql`'{}'::text[]`),
    data: jsonb("data"),
    sourceRef: text("source_ref"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution"),
  },
  (t) => [
    index("issues_open_type_idx").on(t.type).where(sql`${t.resolvedAt} IS NULL`),
    index("issues_reservation_idx").on(t.reservationId),
    index("issues_vessel_idx").on(t.vesselId),
  ],
);

/** Single-row table tracking the state of the shared demo. */
export const appMeta = pgTable(
  "app_meta",
  {
    id: boolean("id").primaryKey().default(true),
    seedVersion: text("seed_version"),
    lastResetAt: timestamp("last_reset_at", { withTimezone: true }),
    mutationsSinceReset: integer("mutations_since_reset").notNull().default(0),
  },
  (t) => [check("app_meta_singleton_ck", sql`${t.id}`)],
);

export type Berth = typeof berths.$inferSelect;
export type Vessel = typeof vessels.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type Issue = typeof issues.$inferSelect;
export type AppMeta = typeof appMeta.$inferSelect;
