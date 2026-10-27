CREATE TYPE "public"."pass_type" AS ENUM('day', 'week', 'month');--> statement-breakpoint
CREATE TYPE "public"."slot_kind" AS ENUM('day', 'night', 'full_day', 'working_hours');--> statement-breakpoint
CREATE TABLE "availability_calendar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"seat_id" uuid,
	"start_date" date NOT NULL,
	"end_date" date,
	"weekdays" smallint DEFAULT 127 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_calendar_seat_unique" UNIQUE("seat_id"),
	CONSTRAINT "availability_calendar_range" CHECK ("availability_calendar"."end_date" IS NULL OR "availability_calendar"."end_date" >= "availability_calendar"."start_date"),
	CONSTRAINT "availability_calendar_weekdays" CHECK ("availability_calendar"."weekdays" BETWEEN 1 AND 127)
);
--> statement-breakpoint
CREATE TABLE "pass_price" (
	"space_id" uuid NOT NULL,
	"slot" "slot_kind" NOT NULL,
	"pass" "pass_type" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pass_price_space_id_slot_pass_pk" PRIMARY KEY("space_id","slot","pass"),
	CONSTRAINT "pass_price_positive" CHECK ("pass_price"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "space_slot" (
	"space_id" uuid NOT NULL,
	"slot" "slot_kind" NOT NULL,
	"enabled" boolean NOT NULL,
	CONSTRAINT "space_slot_space_id_slot_pk" PRIMARY KEY("space_id","slot")
);
--> statement-breakpoint
ALTER TABLE "availability_calendar" ADD CONSTRAINT "availability_calendar_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_calendar" ADD CONSTRAINT "availability_calendar_seat_space_fk" FOREIGN KEY ("seat_id","space_id") REFERENCES "public"."seat"("id","space_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pass_price" ADD CONSTRAINT "pass_price_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_slot" ADD CONSTRAINT "space_slot_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "availability_calendar_shared_unique" ON "availability_calendar" USING btree ("space_id") WHERE "availability_calendar"."seat_id" IS NULL;--> statement-breakpoint
ALTER TABLE "space" ADD CONSTRAINT "space_shift_change_before_noon" CHECK ("space"."shift_change_at" < '12:00');