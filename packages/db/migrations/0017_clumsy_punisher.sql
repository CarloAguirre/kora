CREATE TABLE "team_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(60) NOT NULL,
	"color" varchar(7) NOT NULL,
	"icon" varchar(40) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "team_type_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "team_types_name_key" ON "team_types" USING btree (lower(btrim("name")));--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_team_type_id_team_types_id_fk" FOREIGN KEY ("team_type_id") REFERENCES "public"."team_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "teams_team_type_idx" ON "teams" USING btree ("team_type_id");