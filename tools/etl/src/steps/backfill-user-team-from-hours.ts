import { and, eq, isNull, sql } from 'drizzle-orm';
import { hourEntries, roles, teamMembers, users } from '@kora/db';
import { StepTracker, type EtlContext } from '../lib/context';

/**
 * Corrección puntual, no migración: la migración desde la v1 dejó a algunas
 * personas en el equipo equivocado (ver docs/DECISION-M4-HORAS.md sobre los
 * problemas de líder/equipo post-migración). La señal más confiable de a qué
 * equipo pertenece alguien es a quién le aprueban sus horas: agrupa
 * `hour_entries` (status = 'approved', excluyendo autoaprobación) por
 * `decision_user_id`, y usa el equipo actual de quien más horas le aprobó
 * como equipo correcto.
 *
 * Solo toca personas sin rol `leader` (a un líder no se le reasigna equipo
 * por esta vía) y solo cuando el equipo del aprobador principal es distinto
 * al equipo actual. Ver `diagnose-user-team-from-hours.ts` para inspeccionar
 * los casos antes de correr esto — ahí se valida caso por caso.
 */
export async function backfillUserTeamFromHours(context: EtlContext): Promise<void> {
  const tracker = new StepTracker('backfill equipo desde horas aprobadas');
  const db = context.target;

  const approved = await db
    .select({
      userId: hourEntries.userId,
      decisionUserId: hourEntries.decisionUserId,
      totalHours: sql<string>`sum(${hourEntries.hours})`,
    })
    .from(hourEntries)
    .where(eq(hourEntries.status, 'approved'))
    .groupBy(hourEntries.userId, hourEntries.decisionUserId);

  const byUser = new Map<string, { decisionUserId: string; totalHours: number }[]>();
  for (const row of approved) {
    if (!row.decisionUserId || row.decisionUserId === row.userId) continue;
    const list = byUser.get(row.userId) ?? [];
    list.push({ decisionUserId: row.decisionUserId, totalHours: Number(row.totalHours) });
    byUser.set(row.userId, list);
  }

  const allUsers = await db
    .select({ id: users.id, teamId: users.teamId, roleId: users.roleId, deletedAt: users.deletedAt })
    .from(users);
  const allRoles = await db.select({ id: roles.id, code: roles.code }).from(roles);
  const roleById = new Map(allRoles.map((r) => [r.id, r.code]));
  const userById = new Map(allUsers.map((u) => [u.id, u]));

  tracker.read = allUsers.length;

  for (const user of allUsers) {
    if (user.deletedAt || roleById.get(user.roleId) === 'leader') continue;

    const decisions = byUser.get(user.id);
    if (!decisions || decisions.length === 0) continue;

    decisions.sort((a, b) => b.totalHours - a.totalHours);
    const top = decisions[0];
    if (!top) continue;
    const topLeader = userById.get(top.decisionUserId);
    const candidateTeamId = topLeader?.teamId ?? null;

    if (!candidateTeamId || candidateTeamId === user.teamId) {
      tracker.skipped += 1;
      continue;
    }

    await db.update(users).set({ teamId: candidateTeamId }).where(eq(users.id, user.id));

    await db
      .update(teamMembers)
      .set({ leftAt: sql`now()` })
      .where(and(eq(teamMembers.userId, user.id), isNull(teamMembers.leftAt)));

    await db.insert(teamMembers).values({ teamId: candidateTeamId, userId: user.id });

    tracker.updated += 1;
  }

  context.report.add(tracker.toResult());
}
