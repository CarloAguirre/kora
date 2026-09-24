ALTER TYPE "public"."project_module_task_status" ADD VALUE 'in_review' BEFORE 'done';--> statement-breakpoint
ALTER TABLE "project_module_deliveries" ADD COLUMN "assignee_user_id" uuid;--> statement-breakpoint
ALTER TABLE "project_module_deliveries" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "project_module_tasks" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "project_module_deliveries" ADD CONSTRAINT "project_module_deliveries_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;