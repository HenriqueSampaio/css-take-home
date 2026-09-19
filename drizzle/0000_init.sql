CREATE TYPE "public"."reservation_kind" AS ENUM('vessel', 'event', 'closure');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('confirmed', 'cancelled');--> statement-breakpoint
CREATE TABLE "app_meta" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
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
	"retired_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "berths_name_unique" UNIQUE("name"),
	CONSTRAINT "berths_length_ck" CHECK ("berths"."length_ft" BETWEEN 1 AND 2000)
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
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "reservations_dates_ck" CHECK ("reservations"."end_date" >= "reservations"."start_date"),
	CONSTRAINT "reservations_subject_ck" CHECK (("reservations"."kind" = 'vessel' AND "reservations"."vessel_id" IS NOT NULL) OR ("reservations"."kind" <> 'vessel' AND "reservations"."vessel_id" IS NULL AND "reservations"."title" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "vessels" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"prefix" text,
	"length_ft" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vessels_name_key_unique" UNIQUE("name_key"),
	CONSTRAINT "vessels_length_ck" CHECK ("vessels"."length_ft" BETWEEN 1 AND 1500)
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_berth_id_berths_id_fk" FOREIGN KEY ("berth_id") REFERENCES "public"."berths"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservations_berth_start_idx" ON "reservations" USING btree ("berth_id","start_date");--> statement-breakpoint
CREATE INDEX "reservations_window_idx" ON "reservations" USING btree ("end_date","start_date");--> statement-breakpoint
CREATE INDEX "reservations_vessel_idx" ON "reservations" USING btree ("vessel_id") WHERE "reservations"."vessel_id" IS NOT NULL;