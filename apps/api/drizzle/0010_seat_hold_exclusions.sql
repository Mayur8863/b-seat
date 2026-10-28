-- Custom migration (ADR-0009 sections 2 and 6): drizzle-kit cannot express EXCLUDE constraints.
-- Order matters: (1) the new exclusions, (2) the backfill, (3) the guard against new hourly rows,
-- (4) drop the old exclusions. btree_gist already exists (0002).
ALTER TABLE "seat_hold" ADD CONSTRAINT "seat_hold_seat_no_overlap"
  EXCLUDE USING gist ("seat_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("active");
--> statement-breakpoint
ALTER TABLE "seat_hold" ADD CONSTRAINT "seat_hold_user_no_overlap"
  EXCLUDE USING gist ("user_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("active" AND "user_id" IS NOT NULL);
--> statement-breakpoint
-- OQ-3: one active hold per active, not-ended hourly booking; ended ones get none.
INSERT INTO "seat_hold" ("seat_id", "user_id", "booking_id", "service_date", "starts_at", "ends_at", "active")
SELECT b."seat_id", b."user_id", b."id", (b."starts_at" AT TIME ZONE s."time_zone")::date, b."starts_at", b."ends_at", true
FROM "booking" b
JOIN "seat" st ON st."id" = b."seat_id"
JOIN "space" s ON s."id" = st."space_id"
WHERE b."status" = 'active' AND b."ends_at" > now();
--> statement-breakpoint
-- NOT VALID keeps existing hourly rows as history but refuses any new or updated one.
ALTER TABLE "booking" ADD CONSTRAINT "booking_no_new_hourly" CHECK ("kind" <> 'hourly') NOT VALID;
--> statement-breakpoint
ALTER TABLE "booking" DROP CONSTRAINT "booking_seat_no_overlap";
--> statement-breakpoint
ALTER TABLE "booking" DROP CONSTRAINT "booking_user_no_overlap";
