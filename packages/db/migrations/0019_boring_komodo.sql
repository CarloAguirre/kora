CREATE TYPE "public"."project_module_task_scope" AS ENUM('diseno', 'desarrollo', 'qa', 'revision_cliente');--> statement-breakpoint
ALTER TABLE "project_module_tasks" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "project_module_tasks" ADD COLUMN "scope" "project_module_task_scope" DEFAULT 'desarrollo' NOT NULL;