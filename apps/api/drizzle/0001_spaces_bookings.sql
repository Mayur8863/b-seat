CREATE TYPE "public"."booking_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TABLE "booking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seat_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "booking_ends_after_starts" CHECK ("booking"."ends_at" > "booking"."starts_at"),
	CONSTRAINT "booking_duration_bounds" CHECK ("booking"."ends_at" - "booking"."starts_at" between interval '15 minutes' and interval '10 hours'),
	CONSTRAINT "booking_quarter_hour" CHECK (extract(epoch from "booking"."starts_at") % 900 = 0 and extract(epoch from "booking"."ends_at") % 900 = 0),
	CONSTRAINT "booking_cancel_consistency" CHECK (("booking"."status" = 'cancelled') = ("booking"."cancelled_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "seat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"label" text NOT NULL,
	"features" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seat_space_id_label_unique" UNIQUE("space_id","label"),
	CONSTRAINT "seat_label_length" CHECK (length(btrim("seat"."label")) between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "space" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"time_zone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_name_unique" UNIQUE("name"),
	CONSTRAINT "space_name_length" CHECK (length(btrim("space"."name")) between 1 and 100),
	CONSTRAINT "space_location_length" CHECK (length("space"."location") <= 200)
);
--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_user_id_starts_at_idx" ON "booking" USING btree ("user_id","starts_at");