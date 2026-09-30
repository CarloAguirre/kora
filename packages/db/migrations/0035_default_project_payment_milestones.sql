-- Todo proyecto de desarrollo nace con "Inicio 50%" + "Marcha blanca 50%" (ver CreateProjectUseCase).
-- Se completan los proyectos existentes que todavía no tienen ningún tramo; los que ya tienen tramos no se tocan.
INSERT INTO "project_payment_milestones" ("project_id", "name", "percent", "amount", "sort_order")
SELECT p."id", d."name", 50, 0, d."sort_order"
FROM "projects" p
CROSS JOIN (VALUES ('Inicio', 0), ('Marcha blanca', 1)) AS d("name", "sort_order")
WHERE p."type" = 'development'
  AND p."deleted_at" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "project_payment_milestones" m WHERE m."project_id" = p."id");
