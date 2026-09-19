CREATE TYPE "public"."length_status" AS ENUM('verified', 'probable', 'conflict', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."record_source" AS ENUM('legacy', 'app');--> statement-breakpoint
CREATE TYPE "public"."reservation_kind" AS ENUM('vessel', 'event', 'closure');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('confirmed', 'needs_review', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."vessel_origin" AS ENUM('grid', 'registry', 'app');--> statement-breakpoint
CREATE TABLE "app_meta" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"seed_version" text,
	"last_reset_at" timestamp with time zone,
	"mutations_since_reset" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "app_meta_singleton_ck" CHECK ("app_meta"."id")
);
--> statement-breakpoint
CREATE TABLE "berths" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"length_ft" integer NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "berths_name_unique" UNIQUE("name"),
	CONSTRAINT "berths_length_ck" CHECK ("berths"."length_ft" > 0)
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" text PRIMARY KEY NOT NULL,
	"reservation_id" text,
	"vessel_id" text,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"reason" text,
	"detail" text NOT NULL,
	"related_reservation_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"data" jsonb,
	"source_ref" text,
	"resolved_at" timestamp with time zone,
	"resolution" text
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"berth_id" text NOT NULL,
	"kind" "reservation_kind" NOT NULL,
	"vessel_id" text,
	"title" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "reservation_status" DEFAULT 'confirmed' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"source" "record_source" DEFAULT 'app' NOT NULL,
	"source_ref" text,
	"raw_label" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "reservations_dates_ck" CHECK ("reservations"."end_date" >= "reservations"."start_date"),
	CONSTRAINT "reservations_subject_ck" CHECK (("reservations"."kind" = 'vessel' AND "reservations"."vessel_id" IS NOT NULL) OR ("reservations"."kind" <> 'vessel' AND "reservations"."vessel_id" IS NULL AND "reservations"."title" IS NOT NULL)),
	CONSTRAINT "reservations_legacy_ref_ck" CHECK ("reservations"."source" <> 'legacy' OR "reservations"."source_ref" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "vessels" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"prefix" text,
	"length_ft" integer,
	"length_status" "length_status" DEFAULT 'unknown' NOT NULL,
	"length_candidates" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"length_evidence" text,
	"origin" "vessel_origin" DEFAULT 'app' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vessels_name_key_unique" UNIQUE("name_key"),
	CONSTRAINT "vessels_length_ck" CHECK ("vessels"."length_ft" IS NULL OR "vessels"."length_ft" BETWEEN 1 AND 1500),
	CONSTRAINT "vessels_length_state_ck" CHECK (("vessels"."length_ft" IS NOT NULL) = ("vessels"."length_status" IN ('verified', 'probable')))
);
--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_berth_id_berths_id_fk" FOREIGN KEY ("berth_id") REFERENCES "public"."berths"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issues_open_type_idx" ON "issues" USING btree ("type") WHERE "issues"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX "issues_reservation_idx" ON "issues" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "issues_vessel_idx" ON "issues" USING btree ("vessel_id");--> statement-breakpoint
CREATE INDEX "reservations_berth_start_idx" ON "reservations" USING btree ("berth_id","start_date");--> statement-breakpoint
CREATE INDEX "reservations_window_idx" ON "reservations" USING btree ("end_date","start_date");--> statement-breakpoint
CREATE INDEX "reservations_vessel_idx" ON "reservations" USING btree ("vessel_id") WHERE "reservations"."vessel_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "reservations_review_idx" ON "reservations" USING btree ("start_date") WHERE "reservations"."status" = 'needs_review';