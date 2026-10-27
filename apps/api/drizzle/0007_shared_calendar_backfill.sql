-- Every space has exactly one shared calendar (FR-024). Existing spaces start on their local
-- creation date and run indefinitely, every weekday. New spaces get theirs from the API.
INSERT INTO "availability_calendar" ("space_id", "start_date", "end_date", "weekdays")
SELECT "id", ("created_at" AT TIME ZONE "time_zone")::date, NULL, 127
FROM "space"
WHERE NOT EXISTS (
  SELECT 1 FROM "availability_calendar" c WHERE c."space_id" = "space"."id" AND c."seat_id" IS NULL
);
