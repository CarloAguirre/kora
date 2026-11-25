-- Vincula las HH registradas a un bloque operativo. Las filas históricas se conservan sin asignación.
ALTER TABLE "hour_entries"
  ADD COLUMN IF NOT EXISTS "segment_id" uuid REFERENCES "project_module_segments"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hour_entries_segment_status_idx"
  ON "hour_entries" ("segment_id", "status")
  WHERE "segment_id" IS NOT NULL;
--> statement-breakpoint
-- No se atribuyen automáticamente HH históricas: una fase puede tener varios
-- bloques o equipos. La reconciliación debe ser manual y verificable.
