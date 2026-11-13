-- Attribution explicite des HH a une tache de Roadmap. Les donnees historiques
-- restent NULL; aucune repartition automatique par nom, dates ou estimations.
ALTER TABLE "hour_entries"
  ADD COLUMN IF NOT EXISTS "task_id" uuid REFERENCES "project_module_tasks"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hour_entries_task_approved_idx"
  ON "hour_entries" ("task_id") WHERE "task_id" IS NOT NULL AND "status" = 'approved';
