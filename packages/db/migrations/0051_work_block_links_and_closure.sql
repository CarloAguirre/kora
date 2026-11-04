-- Relaciones explícitas con el bloque y fecha REAL de cierre. Los antiguos permanecen NULL.
ALTER TABLE "project_module_segments"
  ADD COLUMN "closed_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "project_module_deliveries"
  ADD COLUMN "segment_id" uuid REFERENCES "project_module_segments"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "project_module_tasks"
  ADD COLUMN "segment_id" uuid REFERENCES "project_module_segments"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "project_module_deliveries_one_closure_per_segment"
  ON "project_module_deliveries"("segment_id") WHERE "segment_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "project_module_tasks_segment_idx" ON "project_module_tasks"("segment_id");
--> statement-breakpoint
-- Solo vinculamos tareas que contienen un ID exacto, perteneciente a la MISMA fase y equipo.
WITH parsed AS (
  SELECT t.id AS task_id, (substring(t.description FROM '· ID ([0-9a-fA-F-]{36})'))::uuid AS target_id
  FROM "project_module_tasks" t
  WHERE t.description ~ '· ID [0-9a-fA-F-]{36}'
)
UPDATE "project_module_tasks" t SET "segment_id" = s.id
FROM parsed p
JOIN "project_module_segments" s ON s.id = p.target_id
WHERE t.id = p.task_id AND t.module_id = s.module_id AND t.team_id = s.team_id;
--> statement-breakpoint
-- En entregas históricas, vincular solo cuando el equipo+fecha apunta a un único
-- bloque Y a una única entrega. Coincidencias múltiples quedan sin atribuir.
WITH candidates AS (
  SELECT d.id AS delivery_id, MIN(s.id::text)::uuid AS segment_id, COUNT(*) AS matches
  FROM "project_module_deliveries" d
  JOIN "project_module_segments" s ON s.module_id = d.module_id
    AND s.team_id = d.team_id AND s.end_date = d.estimated_date
  GROUP BY d.id
), unique_deliveries AS (
  SELECT d.id
  FROM "project_module_deliveries" d
  WHERE d.team_id IS NOT NULL
    AND (SELECT COUNT(*) FROM "project_module_deliveries" d2
      WHERE d2.module_id = d.module_id AND d2.team_id = d.team_id
        AND d2.estimated_date = d.estimated_date) = 1
)
UPDATE "project_module_deliveries" d SET "segment_id" = c.segment_id
FROM candidates c JOIN unique_deliveries u ON u.id = c.delivery_id
WHERE d.id = c.delivery_id AND c.matches = 1;
--> statement-breakpoint
-- Un único bloque del equipo, dentro de cuyas fechas cae completamente la tarea:
-- recuperamos la relación antigua sin basarnos en títulos ni inventar fechas.
WITH unambiguous AS (
  SELECT t.id AS task_id, MIN(s.id::text)::uuid AS segment_id
  FROM "project_module_tasks" t
  JOIN "project_module_segments" s ON s.module_id = t.module_id
    AND s.team_id = t.team_id AND t.start_date >= s.start_date AND t.date <= s.end_date
  WHERE t.segment_id IS NULL
  GROUP BY t.id
  HAVING COUNT(*) = 1
)
UPDATE "project_module_tasks" t SET "segment_id" = u.segment_id
FROM unambiguous u WHERE t.id = u.task_id AND t.segment_id IS NULL;
--> statement-breakpoint
-- Si todas las tareas ya estaban aprobadas y guardan su instante real,
-- recuperamos el cierre real del último visto bueno; no usamos updated_at.
WITH approved AS (
  SELECT segment_id, MAX(completed_at) AS actual_close,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE status = 'done' AND completed_at IS NOT NULL) AS accepted
  FROM "project_module_tasks" WHERE segment_id IS NOT NULL GROUP BY segment_id
)
UPDATE "project_module_segments" s SET closed_at = a.actual_close
FROM approved a WHERE s.id = a.segment_id AND a.total > 0
  AND a.total = a.accepted AND s.closed_at IS NULL;
