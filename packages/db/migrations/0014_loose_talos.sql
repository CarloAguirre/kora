ALTER TABLE "project_module_tasks" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "project_module_tasks" ALTER COLUMN "status" SET DEFAULT 'todo'::text;--> statement-breakpoint
DROP TYPE "public"."project_module_task_status";--> statement-breakpoint
CREATE TYPE "public"."project_module_task_status" AS ENUM('todo', 'in_progress', 'done');--> statement-breakpoint
ALTER TABLE "project_module_tasks" ALTER COLUMN "status" SET DEFAULT 'todo'::"public"."project_module_task_status";--> statement-breakpoint
ALTER TABLE "project_module_tasks" ALTER COLUMN "status" SET DATA TYPE "public"."project_module_task_status" USING "status"::"public"."project_module_task_status";--> statement-breakpoint
ALTER TABLE "project_module_deliveries" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "project_module_tasks" ADD COLUMN "assignee_user_id" uuid;--> statement-breakpoint
ALTER TABLE "project_module_tasks" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hour_entries" ADD COLUMN "module_id" uuid;--> statement-breakpoint
ALTER TABLE "hour_entries" ADD COLUMN "has_blocker" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hour_entries" ADD COLUMN "blocker_description" text;--> statement-breakpoint
ALTER TABLE "project_module_deliveries" ADD CONSTRAINT "project_module_deliveries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_module_tasks" ADD CONSTRAINT "project_module_tasks_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hour_entries" ADD CONSTRAINT "hour_entries_module_id_project_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."project_modules"("id") ON DELETE set null ON UPDATE no action;