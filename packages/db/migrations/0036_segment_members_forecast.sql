CREATE TABLE "project_module_segment_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segment_id" uuid NOT NULL,
	"team_member_id" uuid NOT NULL,
	"daily_percent" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "forecast_assignments" ADD COLUMN "segment_id" uuid;--> statement-breakpoint
ALTER TABLE "project_module_segment_members" ADD CONSTRAINT "project_module_segment_members_segment_id_project_module_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."project_module_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_module_segment_members" ADD CONSTRAINT "project_module_segment_members_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_module_segment_members_segment_member_key" ON "project_module_segment_members" USING btree ("segment_id","team_member_id");--> statement-breakpoint
ALTER TABLE "forecast_assignments" ADD CONSTRAINT "forecast_assignments_segment_id_project_module_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."project_module_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "forecast_assignments_segment_idx" ON "forecast_assignments" USING btree ("segment_id");