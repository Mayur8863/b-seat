CREATE TABLE "photo_object_purge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"photo_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_object_purge_photo_id_unique" UNIQUE("photo_id"),
	CONSTRAINT "photo_object_purge_reason_valid" CHECK ("photo_object_purge"."reason" IN ('deleted', 'abandoned_upload')),
	CONSTRAINT "photo_object_purge_attempts_nonnegative" CHECK ("photo_object_purge"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "space_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"description" text,
	"display_width" integer NOT NULL,
	"display_height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_photo_position_unique" UNIQUE("space_id","position"),
	CONSTRAINT "space_photo_position_range" CHECK ("space_photo"."position" BETWEEN 1 AND 10),
	CONSTRAINT "space_photo_description_length" CHECK ("space_photo"."description" IS NULL OR char_length("space_photo"."description") BETWEEN 1 AND 150),
	CONSTRAINT "space_photo_display_size_positive" CHECK ("space_photo"."display_width" > 0 AND "space_photo"."display_height" > 0)
);
--> statement-breakpoint
ALTER TABLE "space_photo" ADD CONSTRAINT "space_photo_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photo_object_purge_due_idx" ON "photo_object_purge" USING btree ("due_at");