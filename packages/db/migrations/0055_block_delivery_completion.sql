-- Fecha real, autor y evidencia del cierre de un bloque con entrega programada.
-- No modifica estados ni infiere fechas de entregas históricas.
ALTER TABLE "project_module_deliveries"
  ADD COLUMN IF NOT EXISTS "completed_on" date,
  ADD COLUMN IF NOT EXISTS "completed_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "completion_comment" text;
