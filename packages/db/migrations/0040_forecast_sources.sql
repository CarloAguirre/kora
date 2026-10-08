CREATE TYPE "public"."forecast_assignment_source" AS ENUM('manual', 'segment', 'task');--> statement-breakpoint
-- Toda tarea tiene inicio: el Forecast reparte sus HH entre el inicio y la fecha límite. Las que no lo
-- tenían quedan como tarea de un día (inicio = fecha límite) y el líder puede corregirlas.
UPDATE "project_module_tasks" SET "start_date" = "date" WHERE "start_date" IS NULL;--> statement-breakpoint
UPDATE "project_module_tasks" SET "start_date" = "date" WHERE "start_date" > "date";--> statement-breakpoint
ALTER TABLE "project_module_tasks" ALTER COLUMN "start_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "forecast_assignments" ADD COLUMN "source" "forecast_assignment_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "forecast_assignments" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "forecast_assignments" ADD COLUMN "calculated_hours" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "forecast_assignments" ADD COLUMN "adjusted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "forecast_assignments" ADD COLUMN "adjusted_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "forecast_assignments" ADD COLUMN "is_stale" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "forecast_assignments" ADD CONSTRAINT "forecast_assignments_task_id_project_module_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_module_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_assignments" ADD CONSTRAINT "forecast_assignments_adjusted_by_user_id_users_id_fk" FOREIGN KEY ("adjusted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "forecast_assignments_task_idx" ON "forecast_assignments" USING btree ("task_id");--> statement-breakpoint
-- Las filas que ya generaron los tramos pasan a ser calculadas, sin ajuste (no hay forma de saber si el
-- líder las había tocado). El texto "Roadmap: fase · tramo" sale ahora del propio tramo, así que
-- `comments` queda libre para notas del líder.
UPDATE "forecast_assignments"
SET "source" = 'segment',
    "calculated_hours" = "assigned_hours",
    "comments" = CASE WHEN "comments" LIKE 'Roadmap: %' THEN '' ELSE "comments" END
WHERE "segment_id" IS NOT NULL;
