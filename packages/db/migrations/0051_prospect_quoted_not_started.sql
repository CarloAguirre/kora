-- Migración de datos: Prospecto y Cotización solo pueden estar "No iniciado".
-- La v1 no tenía estado para esos tipos y el ETL los dejaba "Activo" por
-- defecto; se pasan a `draft`. Ninguno tiene Hito 0 ni etapa de avance, así
-- que no hay nada más que revertir. Mismo criterio que
-- `tools/etl/src/steps/migrate-projects.ts`.
UPDATE "projects"
SET "status" = 'draft', "updated_at" = now()
WHERE "type" = 'development'
  AND "sales_stage" IN ('prospect', 'quoted')
  AND "status" = 'active'
  AND "deleted_at" IS NULL;
