-- Custom migration (ADR-0009 section 3 amendment): a booking header's identity never changes after
-- insert. The holds reference (id, seat_id, user_id) through seat_hold_booking_fk, and the seat
-- locks the writers take are per seat, so moving a booking to another seat or renter would
-- bypass both. Only the cancel transition (status, cancelled_at) may update a header.
CREATE FUNCTION "booking_identity_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."seat_id" IS DISTINCT FROM OLD."seat_id"
    OR NEW."user_id" IS DISTINCT FROM OLD."user_id"
    OR NEW."space_id" IS DISTINCT FROM OLD."space_id" THEN
    RAISE EXCEPTION 'booking identity columns cannot change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "booking_identity_immutable"
  BEFORE UPDATE OF "id", "seat_id", "user_id", "space_id" ON "booking"
  FOR EACH ROW EXECUTE FUNCTION "booking_identity_immutable"();
