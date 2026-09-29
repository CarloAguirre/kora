ALTER TABLE "project_observations" ADD COLUMN "delivery_id" uuid;--> statement-breakpoint
ALTER TABLE "project_observations" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "project_observations" ADD CONSTRAINT "project_observations_delivery_id_project_module_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."project_module_deliveries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_observations" ADD CONSTRAINT "project_observations_task_id_project_module_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_module_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_observations_delivery_idx" ON "project_observations" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "project_observations_task_idx" ON "project_observations" USING btree ("task_id");