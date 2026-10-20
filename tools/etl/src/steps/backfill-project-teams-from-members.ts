import { and, eq, isNotNull, isNull, projectTeamMembers, projectTeams, projects, sql, teamMembers, teams } from '@kora/db';
import { StepTracker, type EtlContext } from '../lib/context';

/**
 * Reconciliación, no migración: `migrateProjectTeams` refleja
 * `equipo_proyecto` 1:1, pero esa tabla casi nunca se llenaba en el legacy —
 * un proyecto puede tener personas asignadas (`proyecto_colaborador` o el
 * backfill desde horas) de un equipo sin que ese equipo figure en
 * `project_teams`, y entonces "Equipos e involucrados" aparece sin marcar.
 *
 * Por cada (proyecto, equipo) con asignaciones en `project_team_members`:
 * - si falta la fila en `project_teams`, se crea con `memberCount` = personas
 *   distintas asignadas (sin horas: no hay dato histórico de eso);
 * - si existe pero sin `memberCount`, se completa con ese mismo conteo.
 * Después, todo equipo de proyecto sin líder toma el líder actual del equipo
 * (`teams.leaderUserId`). Un valor ya cargado (p.ej. editado en la app) no se
 * pisa.
 *
 * Solo proyectos migrados (`legacyId`): los creados en la app nueva eligieron
 * sus equipos a mano. Datos ya existentes: ver la migración
 * `0048_backfill_project_teams_from_members.sql`.
 *
 * Va después de `backfillProjectTeamMembersFromHours` y de la poda, para
 * contar sobre el conjunto final de asignaciones. Idempotente.
 */
export async function backfillProjectTeamsFromMembers(context: EtlContext): Promise<void> {
  const tracker = new StepTracker('backfill equipos de proyecto desde asignaciones');

  const aggregated = await context.target
    .select({
      projectId: projectTeamMembers.projectId,
      teamId: projectTeamMembers.teamId,
      memberCount: sql<number>`count(distinct ${teamMembers.userId})::int`,
    })
    .from(projectTeamMembers)
    .innerJoin(projects, eq(projects.id, projectTeamMembers.projectId))
    .innerJoin(teamMembers, eq(teamMembers.id, projectTeamMembers.teamMemberId))
    .where(and(isNull(projects.deletedAt), isNotNull(projects.legacyId)))
    .groupBy(projectTeamMembers.projectId, projectTeamMembers.teamId);

  tracker.read = aggregated.length;

  for (const row of aggregated) {
    const existing = await context.target
      .select({ id: projectTeams.id, memberCount: projectTeams.memberCount })
      .from(projectTeams)
      .where(and(eq(projectTeams.projectId, row.projectId), eq(projectTeams.teamId, row.teamId)))
      .limit(1);

    if (!existing[0]) {
      await context.target.insert(projectTeams).values({
        projectId: row.projectId,
        teamId: row.teamId,
        memberCount: row.memberCount,
      });
      tracker.created += 1;
    } else if (existing[0].memberCount === null) {
      await context.target
        .update(projectTeams)
        .set({ memberCount: row.memberCount, updatedAt: new Date() })
        .where(eq(projectTeams.id, existing[0].id));
      tracker.updated += 1;
    } else {
      tracker.skipped += 1;
    }
  }

  const withLeader = await context.target
    .update(projectTeams)
    .set({
      leaderUserId: sql`(select ${teams.leaderUserId} from ${teams} where ${teams.id} = ${projectTeams.teamId})`,
      updatedAt: new Date(),
    })
    .where(
      and(
        isNull(projectTeams.leaderUserId),
        sql`exists (select 1 from ${teams} where ${teams.id} = ${projectTeams.teamId} and ${teams.leaderUserId} is not null)`,
        sql`exists (select 1 from ${projects} where ${projects.id} = ${projectTeams.projectId} and ${projects.deletedAt} is null and ${projects.legacyId} is not null)`,
      ),
    )
    .returning({ id: projectTeams.id });
  tracker.updated += withLeader.length;

  context.report.add(tracker.toResult());
}
