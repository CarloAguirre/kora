ALTER TABLE "projects" ADD COLUMN "qa_testing_start_date" date;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "qa_testing_end_date" date;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "qa_evaluated_module" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "qa_planned_tests" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "qa_executed_tests" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "qa_failed_tests" integer;