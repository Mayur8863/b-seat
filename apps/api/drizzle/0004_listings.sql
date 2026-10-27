CREATE TYPE "public"."opening_mode" AS ENUM('always_open', 'fixed_hours');--> statement-breakpoint
CREATE TYPE "public"."space_status" AS ENUM('draft', 'published', 'unpublished');--> statement-breakpoint
CREATE TABLE "cubicle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "cubicle_id_space_id_unique" UNIQUE("id","space_id"),
	CONSTRAINT "cubicle_name_length" CHECK (length(btrim("cubicle"."name")) between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "seat" DROP CONSTRAINT "seat_space_id_label_unique";--> statement-breakpoint
ALTER TABLE "space" DROP CONSTRAINT "space_name_unique";--> statement-breakpoint
ALTER TABLE "space" ALTER COLUMN "location" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "seat" ADD COLUMN "cubicle_id" uuid;--> statement-breakpoint
ALTER TABLE "seat" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "space" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "space" ADD COLUMN "status" "space_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "space" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "space" ADD COLUMN "country" char(2);--> statement-breakpoint
ALTER TABLE "space" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "space" ADD COLUMN "area" text;--> statement-breakpoint
ALTER TABLE "space" ADD COLUMN "city_key" text GENERATED ALWAYS AS (lower(btrim("city"))) STORED;--> statement-breakpoint
ALTER TABLE "space" ADD COLUMN "area_key" text GENERATED ALWAYS AS (lower(btrim("area"))) STORED;--> statement-breakpoint
ALTER TABLE "space" ADD COLUMN "street_address" text;--> statement-breakpoint
ALTER TABLE "space" ADD COLUMN "currency" char(3);--> statement-breakpoint
ALTER TABLE "space" ADD COLUMN "opening_mode" "opening_mode";--> statement-breakpoint
ALTER TABLE "space" ADD COLUMN "opens_at" time;--> statement-breakpoint
ALTER TABLE "space" ADD COLUMN "closes_at" time;--> statement-breakpoint
ALTER TABLE "space" ADD COLUMN "shift_change_at" time;--> statement-breakpoint
ALTER TABLE "space" ADD COLUMN "utilities" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "space" ADD COLUMN "custom_utilities" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "space" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "cubicle" ADD CONSTRAINT "cubicle_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cubicle_space_id_name_active_unique" ON "cubicle" USING btree ("space_id","name") WHERE "cubicle"."removed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_cubicle_space_fk" FOREIGN KEY ("cubicle_id","space_id") REFERENCES "public"."cubicle"("id","space_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space" ADD CONSTRAINT "space_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seat_space_id_label_active_unique" ON "seat" USING btree ("space_id","label") WHERE "seat"."removed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "space_owner_id_idx" ON "space" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "space_search_idx" ON "space" USING btree ("country","city_key","area_key") WHERE "space"."status" = 'published';--> statement-breakpoint
CREATE INDEX "space_city_prefix_idx" ON "space" USING btree ("country","city_key" text_pattern_ops) WHERE "space"."status" = 'published';--> statement-breakpoint
CREATE INDEX "space_area_prefix_idx" ON "space" USING btree ("country","city_key","area_key" text_pattern_ops) WHERE "space"."status" = 'published';--> statement-breakpoint
CREATE INDEX "space_utilities_gin" ON "space" USING gin ("utilities");--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_id_space_id_unique" UNIQUE("id","space_id");--> statement-breakpoint
ALTER TABLE "space" ADD CONSTRAINT "space_description_length" CHECK (length(btrim("space"."description")) between 1 and 2000);--> statement-breakpoint
ALTER TABLE "space" ADD CONSTRAINT "space_country_format" CHECK ("space"."country" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "space" ADD CONSTRAINT "space_city_length" CHECK (length(btrim("space"."city")) between 1 and 100);--> statement-breakpoint
ALTER TABLE "space" ADD CONSTRAINT "space_area_length" CHECK (length(btrim("space"."area")) between 1 and 100);--> statement-breakpoint
ALTER TABLE "space" ADD CONSTRAINT "space_street_address_length" CHECK (length(btrim("space"."street_address")) between 1 and 200);--> statement-breakpoint
ALTER TABLE "space" ADD CONSTRAINT "space_currency_format" CHECK ("space"."currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "space" ADD CONSTRAINT "space_opening_hours_valid" CHECK ("space"."opening_mode" IS NULL OR ("space"."opening_mode" = 'always_open' AND "space"."shift_change_at" IS NOT NULL) OR ("space"."opening_mode" = 'fixed_hours' AND "space"."opens_at" IS NOT NULL AND "space"."closes_at" IS NOT NULL AND "space"."closes_at" > "space"."opens_at"));--> statement-breakpoint
ALTER TABLE "space" ADD CONSTRAINT "space_custom_utilities_max" CHECK (cardinality("space"."custom_utilities") <= 5);--> statement-breakpoint
ALTER TABLE "space" ADD CONSTRAINT "space_owned_complete" CHECK ("space"."owner_id" IS NULL OR ("space"."description" IS NOT NULL AND "space"."country" IS NOT NULL AND "space"."city" IS NOT NULL AND "space"."area" IS NOT NULL AND "space"."street_address" IS NOT NULL AND "space"."currency" IS NOT NULL AND "space"."opening_mode" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "space" ADD CONSTRAINT "space_published_has_owner" CHECK ("space"."status" = 'draft' OR "space"."owner_id" IS NOT NULL);