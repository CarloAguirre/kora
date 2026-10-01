-- El % de avance deja de ser un dato manual heredado de v1: `actual_progress` pasa a ser un caché del
-- avance real calculado desde las tareas (ver `calculateProjectProgress` en apps/api), que se
-- recalcula al cambiar fases o tareas. `expected_progress` ya no se usa: el esperado se calcula al leer.
-- Este backfill replica el cálculo una sola vez para los proyectos existentes.
UPDATE "projects" SET "actual_progress" = NULL, "expected_progress" = NULL;
--> statement-breakpoint
WITH task_stats AS (
  SELECT "module_id", count(*) AS task_count, avg("estimated_hours") FILTER (WHERE "estimated_hours" > 0) AS avg_hours
  FROM "project_module_tasks"
  GROUP BY "module_id"
),
weighted AS (
  -- Peso = HH estimadas; las tareas sin HH pesan el promedio de su fase. Si ninguna tiene, se reparten
  -- por igual las HH de la fase (o pesan 1 si la fase tampoco tiene).
  SELECT t."module_id", t."status",
    CASE
      WHEN t."estimated_hours" > 0 THEN t."estimated_hours"
      ELSE coalesce(s.avg_hours, CASE WHEN m."estimated_hours" > 0 THEN m."estimated_hours" / s.task_count ELSE 1 END)
    END AS weight
  FROM "project_module_tasks" t
  JOIN task_stats s ON s."module_id" = t."module_id"
  JOIN "project_modules" m ON m."id" = t."module_id"
),
module_totals AS (
  SELECT m."project_id",
    m."current_stage" = 'closed' AS closed,
    count(w."module_id") AS task_count,
    coalesce(sum(w.weight), 0) AS task_total,
    coalesce(sum(w.weight) FILTER (WHERE w."status" = 'done'), 0) AS approved,
    CASE WHEN m."estimated_hours" > 0 THEN m."estimated_hours" ELSE 0 END AS module_hours
  FROM "project_modules" m
  LEFT JOIN weighted w ON w."module_id" = m."id"
  GROUP BY m."id"
),
project_totals AS (
  SELECT "project_id",
    sum(greatest(task_total, module_hours)) AS base,
    sum(CASE WHEN closed THEN greatest(task_total, module_hours) ELSE approved END) AS approved,
    bool_or(task_count > 0 OR closed) AS has_plan
  FROM module_totals
  GROUP BY "project_id"
)
UPDATE "projects" p
SET "actual_progress" = least(100, greatest(0, round(pt.approved / pt.base * 100)))::integer
FROM project_totals pt
WHERE pt."project_id" = p."id" AND pt.has_plan AND pt.base > 0;
