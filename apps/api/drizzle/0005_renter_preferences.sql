CREATE TABLE "renter_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"country" char(2),
	"city" text,
	"area" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "renter_preference_country_format" CHECK ("renter_preference"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "renter_preference_city_length" CHECK (length(btrim("renter_preference"."city")) between 1 and 100),
	CONSTRAINT "renter_preference_area_length" CHECK (length(btrim("renter_preference"."area")) between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "renter_preference" ADD CONSTRAINT "renter_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;