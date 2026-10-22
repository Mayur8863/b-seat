-- Custom migration (ADR-0008 section 2): drizzle-kit cannot express EXCLUDE constraints.
-- No two active bookings may overlap for one seat, or for one user. Ranges are half-open,
-- so back-to-back windows are allowed; cancelled rows stop blocking. btree_gist provides
-- `=` on uuid/text inside GiST and is a trusted extension (PG 13+), so the database owner
-- can create it (a no-op locally, where docker/postgres/init already did).
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_seat_no_overlap"
  EXCLUDE USING gist ("seat_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("status" = 'active');
--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_user_no_overlap"
  EXCLUDE USING gist ("user_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("status" = 'active');
