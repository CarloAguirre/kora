-- Migración de datos: equipos de proyecto derivados de las asignaciones.
-- `equipo_proyecto` casi nunca se llenaba en la v1, así que muchos proyectos
-- migrados tienen personas asignadas (`project_team_members`) de un equipo sin
-- la fila correspondiente en `project_teams` — "Equipos e involucrados" queda
-- sin marcar. Se crea la fila faltante con `member_count` = personas distintas
-- asignadas, y se completa `member_count` donde la fila existe pero sin dato.
-- Después, todo equipo de proyecto sin líder toma el líder actual del equipo.
-- Nunca se pisa un valor ya cargado. Solo proyectos migrados (`legacy_id`);
-- los creados en la app nueva eligieron sus equipos a mano.
-- Mismo criterio que `tools/etl/src/steps/backfill-project-teams-from-members.ts`.
INSERT INTO "project_teams" ("project_id", "team_id", "member_count")
SELECT ptm."project_id", ptm."team_id", count(DISTINCT tm."user_id")::int
FROM "project_team_members" ptm
JOIN "team_members" tm ON tm."id" = ptm."team_member_id"
JOIN "projects" p ON p."id" = ptm."project_id"
WHERE p."deleted_at" IS NULL AND p."legacy_id" IS NOT NULL
GROUP BY ptm."project_id", ptm."team_id"
ON CONFLICT ("project_id", "team_id") DO UPDATE
  SET "member_count" = EXCLUDED."member_count", "updated_at" = now()
  WHERE "project_teams"."member_count" IS NULL;
--> statement-breakpoint
UPDATE "project_teams" pt
SET "leader_user_id" = t."leader_user_id", "updated_at" = now()
FROM "teams" t, "projects" p
WHERE t."id" = pt."team_id"
  AND p."id" = pt."project_id"
  AND pt."leader_user_id" IS NULL
  AND t."leader_user_id" IS NOT NULL
  AND p."deleted_at" IS NULL
  AND p."legacy_id" IS NOT NULL;
