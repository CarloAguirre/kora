import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, inArray, isNull, projects, teams, type Database } from '@kora/db';
import type { LeaderProfile } from '@kora/contracts';
import type { LeaderProfileResolver } from '../../application/ports/leader-profile-resolver.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';

/**
 * Resuelve el perfil de líder a partir de sus asignaciones reales.
 *
 * Reglas (las mismas que la v1, ahora en el servidor y resueltas en lote):
 *   proyectos activos + equipos a cargo → 'both'
 *   solo proyectos activos              → 'project_manager'
 *   solo equipos a cargo                → 'team_leader'
 *   sin asignaciones                    → null
 *
 * Con el módulo de proyectos (M3) ya en pie, ambos conteos se resuelven contra
 * datos reales — hasta entonces `countActiveLedProjects` devolvía siempre cero.
 */
@Injectable()
export class AssignmentLeaderProfileResolver implements LeaderProfileResolver {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async resolve(userId: string): Promise<LeaderProfile | null> {
    const profiles = await this.resolveMany([userId]);
    return profiles.get(userId) ?? null;
  }

  async resolveMany(userIds: readonly string[]): Promise<Map<string, LeaderProfile | null>> {
    const profiles = new Map<string, LeaderProfile | null>();
    if (userIds.length === 0) return profiles;

    const [ledTeams, ledProjects] = await Promise.all([
      this.countLedTeams(userIds),
      this.countActiveLedProjects(userIds),
    ]);

    for (const userId of userIds) {
      profiles.set(
        userId,
        deriveLeaderProfile((ledProjects.get(userId) ?? 0) > 0, (ledTeams.get(userId) ?? 0) > 0),
      );
    }

    return profiles;
  }

  private async countLedTeams(userIds: readonly string[]): Promise<Map<string, number>> {
    const rows = await this.database
      .select({ leaderUserId: teams.leaderUserId, value: count() })
      .from(teams)
      .where(
        and(
          inArray(teams.leaderUserId, [...userIds]),
          isNull(teams.deletedAt),
          eq(teams.isActive, true),
        ),
      )
      .groupBy(teams.leaderUserId);

    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row.leaderUserId) counts.set(row.leaderUserId, Number(row.value));
    }
    return counts;
  }

  private async countActiveLedProjects(userIds: readonly string[]): Promise<Map<string, number>> {
    const rows = await this.database
      .select({ leaderUserId: projects.leaderUserId, value: count() })
      .from(projects)
      .where(
        and(
          inArray(projects.leaderUserId, [...userIds]),
          eq(projects.status, 'active'),
          isNull(projects.deletedAt),
        ),
      )
      .groupBy(projects.leaderUserId);

    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row.leaderUserId) counts.set(row.leaderUserId, Number(row.value));
    }
    return counts;
  }
}

/**
 * La regla en sí, aislada como función pura para poder probar los cuatro casos
 * sin base de datos.
 */
export function deriveLeaderProfile(
  hasActiveProjects: boolean,
  hasLedTeams: boolean,
): LeaderProfile | null {
  if (hasActiveProjects && hasLedTeams) return 'both';
  if (hasActiveProjects) return 'project_manager';
  if (hasLedTeams) return 'team_leader';
  return null;
}
