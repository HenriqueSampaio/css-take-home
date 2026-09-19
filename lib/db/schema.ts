/**
 * Database schema. Tables, enums, CHECKs and indexes live here and are turned into SQL by
 * `drizzle-kit generate`. The one thing Drizzle cannot express, the exclusion constraint
 * that makes double-booking impossible, lives in the hand-written migration
 * `drizzle/0001_constraints.sql`.
 *
 * Dates are `date` columns read and written as plain 'YYYY-MM-DD' strings.
 */
import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const reservationKind = pgEnum("reservation_kind", ["vessel", "event", "closure"]);
export const reservationStatus = pgEnum("reservation_status", ["confirmed", "cancelled"]);

export const berths = pgTable(
  "berths",
  {
    id: text("id").primaryKey(), // slug of the name, e.g. 'north-pier-west'
    name: text("name").notNull().unique(),
    lengthFt: integer("length_ft").notNull(),
    sortOrder: integer("sort_order").notNull(),
    /** A berth is never deleted (its history would go with it); it is retired and drops off the schedule. */
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("berths_length_ck", sql`${t.lengthFt} BETWEEN 1 AND 2000`)],
);

export const vessels = pgTable(
  "vessels",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(), // without type prefix
    nameKey: text("name_key").notNull().unique(), // identity: uppercased name, so one hull cannot be registered twice
    prefix: text("prefix"), // display only: 'R/V', 'Tug', ...
    /** Required: a vessel with no length could never be checked against a berth. */
    lengthFt: integer("length_ft").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("vessels_length_ck", sql`${t.lengthFt} BETWEEN 1 AND 1500`)],
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
    index("reservations_berth_start_idx").on(t.berthId, t.startDate),
    index("reservations_window_idx").on(t.endDate, t.startDate),
    index("reservations_vessel_idx").on(t.vesselId).where(sql`${t.vesselId} IS NOT NULL`),
  ],
);

/** Single-row table tracking the state of the shared demo. */
export const appMeta = pgTable(
  "app_meta",
  {
    id: boolean("id").primaryKey().default(true),
    lastResetAt: timestamp("last_reset_at", { withTimezone: true }),
    mutationsSinceReset: integer("mutations_since_reset").notNull().default(0),
  },
  (t) => [check("app_meta_singleton_ck", sql`${t.id}`)],
);

export type Berth = typeof berths.$inferSelect;
export type Vessel = typeof vessels.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type AppMeta = typeof appMeta.$inferSelect;
