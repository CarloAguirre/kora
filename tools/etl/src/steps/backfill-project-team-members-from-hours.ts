import { and, eq, hourEntries, isNull, projectTeamMembers, projects, sql, teamMembers } from '@kora/db';
import { StepTracker, type EtlContext } from '../lib/context';

/**
 * Reconciliación, no migración: `migrateProjectTeamMembers` refleja
 * `proyecto_colaborador` 1:1, pero esa tabla es un subconjunto mucho más
 * angosto que `hour_entries` (157 filas para 194 proyectos, ver
 * docs/PLAN-MODULOS.md) — muchos proyectos legacy tienen horas cargadas por
 * una persona sin que esa persona jamás haya quedado registrada como
 * colaboradora asignada. Este paso cierra esa brecha: por cada (proyecto,
 * usuario) con horas aprobadas y sin fila en `project_team_members`, crea una
 * asignación usando el equipo activo actual de la persona, con
 * `assignedHours = 0` (no hay dato histórico de eso) y `consumedHours` igual
 * a la suma de sus horas aprobadas en ese proyecto.
 *
 * Idempotente: una fila ya asignada (por este paso o por
 * `migrateProjectTeamMembers`) hace que la persona se salte en la siguiente
 * corrida. Si la persona no tiene exactamente un equipo activo, se omite y se
 * reporta como aviso — asignarla a ciegas al equipo equivocado sería peor que
 * dejarla sin asignar.
 */
export async function backfillProjectTeamMembersFromHours(context: EtlContext): Promise<void> {
  const tracker = new StepTracker('backfill asignaciones desde horas');

  const aggregated = await context.target
    .select({
      projectId: hourEntries.projectId,
      userId: hourEntries.userId,
      totalHours: sql<string>`sum(${hourEntries.hours})`,
    })
    .from(hourEntries)
    .innerJoin(projects, eq(projects.id, hourEntries.projectId))
    .where(and(eq(hourEntries.status, 'approved'), isNull(projects.deletedAt)))
    .groupBy(hourEntries.projectId, hourEntries.userId);

  tracker.read = aggregated.length;

  for (const row of aggregated) {
    const { projectId, userId } = row;
    if (!projectId) continue;
    if (Number(row.totalHours) <= 0) {
      tracker.skipped += 1;
      continue;
    }

    const existing = await context.target
      .select({ id: projectTeamMembers.id })
      .from(projectTeamMembers)
      .innerJoin(teamMembers, eq(teamMembers.id, projectTeamMembers.teamMemberId))
      .where(and(eq(projectTeamMembers.projectId, projectId), eq(teamMembers.userId, userId)))
      .limit(1);

    if (existing[0]) {
      tracker.skipped += 1;
      continue;
    }

    const activeMemberships = await context.target
      .select({ id: teamMembers.id, teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, userId), isNull(teamMembers.leftAt)));

    const membership = activeMemberships.length === 1 ? activeMemberships[0] : undefined;
    if (!membership) {
      tracker.warn(
        `usuario ${userId} en proyecto ${projectId}: ${activeMemberships.length} equipo(s) activo(s), no se autoasigna sin ambigüedad`,
      );
      tracker.skipped += 1;
      continue;
    }
    await context.target.insert(projectTeamMembers).values({
      projectId,
      teamId: membership.teamId,
      teamMemberId: membership.id,
      activity: null,
      assignedHours: '0',
      consumedHours: row.totalHours,
    });
    tracker.created += 1;
  }

  context.report.add(tracker.toResult());
}
