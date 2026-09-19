-- The rule this system exists for: a berth has at most one confirmed occupant per day.
--
-- An exclusion constraint makes that a property of the data, not of whichever code path
-- happens to write it: two requests racing for the same berth cannot both commit, and a
-- future script, admin tool or bug cannot create a double-booking either.
--
-- * daterange(start, end, '[]') is INCLUSIVE at both ends: one berth-day has one occupant,
--   so a stay ending Jul 5 and one starting Jul 5 collide.
-- * It is PARTIAL on status = 'confirmed', so a cancelled reservation frees its days.
-- * btree_gist supplies the equality operator class for the text berth_id inside a GiST index.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_no_double_booking"
  EXCLUDE USING gist ("berth_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&)
  WHERE ("status" = 'confirmed');
