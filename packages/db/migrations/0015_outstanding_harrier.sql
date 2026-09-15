ALTER TABLE "project_module_tasks" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "project_module_tasks" ADD COLUMN "estimated_hours" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "demo_link" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "test_environment_link" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "figma_link" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "documentation_link" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "impact_before_hours" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "impact_before_people" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "impact_before_duration" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "impact_before_modality" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "impact_after_hours" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "impact_after_people" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "impact_after_duration" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "impact_after_modality" text;