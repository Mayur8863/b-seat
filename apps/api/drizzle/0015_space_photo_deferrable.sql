-- drizzle-kit cannot express DEFERRABLE. INITIALLY IMMEDIATE still checks at the end of each
-- statement, so one permuting UPDATE succeeds with no SET CONSTRAINTS (ADR-0011 section 7).
ALTER TABLE "space_photo" DROP CONSTRAINT "space_photo_position_unique";--> statement-breakpoint
ALTER TABLE "space_photo" ADD CONSTRAINT "space_photo_position_unique" UNIQUE ("space_id", "position") DEFERRABLE INITIALLY IMMEDIATE;
