ALTER TABLE "project_observations" ADD COLUMN "is_hito0" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: marca como Hito 0 el primer registro automático de activación de cada proyecto
-- (manual, automático al facturar, o Gerencia resolviendo un Hito 0 pausado) y alinea su fecha
-- con `projects.hito0_at` — que pudo haberse corregido después desde la ficha.
WITH hito0_rows AS (
  SELECT DISTINCT ON (o.project_id) o.id, p.hito0_at
  FROM "project_observations" o
  JOIN "projects" p ON p.id = o.project_id
  -- La migración corre en una transacción junto al ALTER TYPE que agregó este valor.
  -- Comparar como texto evita el error 55P04 (uso prematuro de un valor nuevo del enum).
  WHERE o.type::text = 'cambio_proyecto'
    AND p.hito0_at IS NOT NULL
    AND (
      o.message LIKE 'Proyecto activado manualmente (Hito 0)%'
      OR o.message LIKE 'Proyecto activado automáticamente (Hito 0)%'
      OR o.message LIKE 'Gerencia activó el proyecto (Hito 0%'
    )
  ORDER BY o.project_id, o.created_at ASC
)
UPDATE "project_observations" o
SET "is_hito0" = true,
    "date" = (h.hito0_at AT TIME ZONE 'UTC')::date
FROM hito0_rows h
WHERE o.id = h.id;
