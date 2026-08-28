CREATE TYPE "public"."forecast_assignment_type" AS ENUM('project', 'support', 'vacation', 'admin_day', 'day_off', 'sick_leave', 'training', 'other');--> statement-breakpoint
CREATE TABLE "forecast_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" integer,
	"team_member_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"type" "forecast_assignment_type" NOT NULL,
	"project_id" uuid,
	"client_id" uuid,
	"comments" text DEFAULT '' NOT NULL,
	"assigned_hours" numeric(6, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "forecast_assignments" ADD CONSTRAINT "forecast_assignments_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_assignments" ADD CONSTRAINT "forecast_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_assignments" ADD CONSTRAINT "forecast_assignments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_assignments_legacy_id_key" ON "forecast_assignments" USING btree ("legacy_id") WHERE "forecast_assignments"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "forecast_assignments_member_period_idx" ON "forecast_assignments" USING btree ("team_member_id","period_start","period_end");