CREATE TYPE "public"."layout_element_kind" AS ENUM('seat', 'cubicle', 'area');--> statement-breakpoint
CREATE TABLE "layout_element" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"kind" "layout_element_kind" NOT NULL,
	"seat_id" uuid,
	"cubicle_id" uuid,
	"label" text,
	"x" smallint NOT NULL,
	"y" smallint NOT NULL,
	"w" smallint NOT NULL,
	"h" smallint NOT NULL,
	CONSTRAINT "layout_element_seat_id_unique" UNIQUE("seat_id"),
	CONSTRAINT "layout_element_cubicle_id_unique" UNIQUE("cubicle_id"),
	CONSTRAINT "layout_element_kind_ref" CHECK (("layout_element"."kind" = 'seat') = ("layout_element"."seat_id" IS NOT NULL) AND ("layout_element"."kind" = 'cubicle') = ("layout_element"."cubicle_id" IS NOT NULL) AND ("layout_element"."kind" = 'area') = ("layout_element"."label" IS NOT NULL)),
	CONSTRAINT "layout_element_label_length" CHECK ("layout_element"."label" IS NULL OR length(btrim("layout_element"."label")) between 1 and 40),
	CONSTRAINT "layout_element_origin" CHECK ("layout_element"."x" >= 0 AND "layout_element"."y" >= 0),
	CONSTRAINT "layout_element_size" CHECK ("layout_element"."w" >= 1 AND "layout_element"."h" >= 1)
);
--> statement-breakpoint
CREATE TABLE "space_layout" (
	"space_id" uuid PRIMARY KEY NOT NULL,
	"columns" smallint NOT NULL,
	"rows" smallint NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_layout_columns_range" CHECK ("space_layout"."columns" between 10 and 80),
	CONSTRAINT "space_layout_rows_range" CHECK ("space_layout"."rows" between 10 and 80)
);
--> statement-breakpoint
ALTER TABLE "layout_element" ADD CONSTRAINT "layout_element_space_id_space_layout_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space_layout"("space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layout_element" ADD CONSTRAINT "layout_element_seat_space_fk" FOREIGN KEY ("seat_id","space_id") REFERENCES "public"."seat"("id","space_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layout_element" ADD CONSTRAINT "layout_element_cubicle_space_fk" FOREIGN KEY ("cubicle_id","space_id") REFERENCES "public"."cubicle"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_layout" ADD CONSTRAINT "space_layout_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE restrict ON UPDATE no action;