CREATE TYPE "public"."booking_kind" AS ENUM('hourly', 'pass');--> statement-breakpoint
CREATE TABLE "occupancy_mark" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "occupancy_mark_id_seat_id_unique" UNIQUE("id","seat_id"),
	CONSTRAINT "occupancy_mark_dates" CHECK ("occupancy_mark"."end_date" is null or "occupancy_mark"."end_date" >= "occupancy_mark"."start_date"),
	CONSTRAINT "occupancy_mark_note_length" CHECK ("occupancy_mark"."note" is null or length("occupancy_mark"."note") <= 200)
);
--> statement-breakpoint
CREATE TABLE "seat_hold" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seat_id" uuid NOT NULL,
	"user_id" text,
	"booking_id" uuid,
	"occupancy_mark_id" uuid,
	"service_date" date,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "seat_hold_occupancy_mark_id_unique" UNIQUE("occupancy_mark_id"),
	CONSTRAINT "seat_hold_one_source" CHECK (num_nonnulls("seat_hold"."booking_id", "seat_hold"."occupancy_mark_id") = 1),
	CONSTRAINT "seat_hold_user_iff_booking" CHECK (("seat_hold"."booking_id" is null) = ("seat_hold"."user_id" is null)),
	CONSTRAINT "seat_hold_booking_bounded" CHECK ("seat_hold"."booking_id" is null or ("seat_hold"."ends_at" is not null and "seat_hold"."service_date" is not null)),
	CONSTRAINT "seat_hold_ends_after_starts" CHECK ("seat_hold"."ends_at" is null or "seat_hold"."ends_at" > "seat_hold"."starts_at"),
	CONSTRAINT "seat_hold_booking_max_length" CHECK ("seat_hold"."booking_id" is null or "seat_hold"."ends_at" - "seat_hold"."starts_at" <= interval '26 hours')
);
--> statement-breakpoint
ALTER TABLE "booking" DROP CONSTRAINT "booking_duration_bounds";--> statement-breakpoint
ALTER TABLE "booking" DROP CONSTRAINT "booking_quarter_hour";--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "kind" "booking_kind" DEFAULT 'hourly' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "space_id" uuid;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "pass" "pass_type";--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "slot" "slot_kind";--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "currency" char(3);--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "holds_active" boolean GENERATED ALWAYS AS (status = 'active') STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "occupancy_mark" ADD CONSTRAINT "occupancy_mark_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occupancy_mark" ADD CONSTRAINT "occupancy_mark_seat_space_fk" FOREIGN KEY ("seat_id","space_id") REFERENCES "public"."seat"("id","space_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_hold" ADD CONSTRAINT "seat_hold_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_hold" ADD CONSTRAINT "seat_hold_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Moved before the FK that references it (drizzle-kit emitted it after, which fails).
ALTER TABLE "booking" ADD CONSTRAINT "booking_hold_key_unique" UNIQUE("id","seat_id","user_id","holds_active");--> statement-breakpoint
ALTER TABLE "seat_hold" ADD CONSTRAINT "seat_hold_booking_fk" FOREIGN KEY ("booking_id","seat_id","user_id","active") REFERENCES "public"."booking"("id","seat_id","user_id","holds_active") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seat_hold" ADD CONSTRAINT "seat_hold_occupancy_mark_fk" FOREIGN KEY ("occupancy_mark_id","seat_id") REFERENCES "public"."occupancy_mark"("id","seat_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seat_hold_seat_id_idx" ON "seat_hold" USING btree ("seat_id");--> statement-breakpoint
CREATE INDEX "seat_hold_booking_id_idx" ON "seat_hold" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "seat_hold_user_id_idx" ON "seat_hold" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_seat_space_fk" FOREIGN KEY ("seat_id","space_id") REFERENCES "public"."seat"("id","space_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_space_id_starts_at_idx" ON "booking" USING btree ("space_id","starts_at");--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_pass_complete" CHECK ("booking"."kind" = 'hourly' or ("booking"."space_id" is not null and "booking"."pass" is not null and "booking"."slot" is not null and "booking"."start_date" is not null and "booking"."end_date" is not null and "booking"."price" is not null and "booking"."currency" is not null));--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_pass_length" CHECK ("booking"."kind" = 'hourly' or "booking"."end_date" - "booking"."start_date" = case "booking"."pass" when 'day' then 0 when 'week' then 6 else 29 end);--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_price_positive" CHECK ("booking"."price" is null or "booking"."price" > 0);--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_duration_bounds" CHECK ("booking"."kind" <> 'hourly' or "booking"."ends_at" - "booking"."starts_at" between interval '15 minutes' and interval '10 hours');--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_quarter_hour" CHECK ("booking"."kind" <> 'hourly' or (extract(epoch from "booking"."starts_at") % 900 = 0 and extract(epoch from "booking"."ends_at") % 900 = 0));