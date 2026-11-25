-- Bloqueo reversible de la participación: conserva los registros de horas y su identidad histórica.
ALTER TABLE "project_team_members"
  ADD COLUMN IF NOT EXISTS "blocked_at" timestamptz;
--> statement-breakpoint
-- Cancelación lógica de tareas con actividad: no se borra la bitácora ni el vínculo.
ALTER TABLE "project_module_tasks"
  ADD COLUMN IF NOT EXISTS "cancelled_at" timestamptz;
