-- Permite reconocer saldo histórico que NO figura en hour_entries.
-- used_hours sigue siendo un caché: SUM(HH aprobadas) + historical_hours_adjustment.
-- Esta migración no aplica ajustes a proyectos existentes (default 0).
ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "historical_hours_adjustment"
  numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_historical_hours_adjustment_nonnegative"
  CHECK ("historical_hours_adjustment" >= 0);
