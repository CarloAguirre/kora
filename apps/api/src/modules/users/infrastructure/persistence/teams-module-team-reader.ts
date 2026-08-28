import { Inject, Injectable } from '@nestjs/common';
import type { TeamReader, TeamReference } from '../../application/ports/team-reader.port';
import {
  TEAM_REPOSITORY,
  type TeamRepository,
} from '../../../teams/domain/repositories/team.repository';

/**
 * Satisface el puerto `TeamReader` de usuarios con el `TeamsModule` real.
 *
 * Sustituye a `DrizzleTeamReader`, el adaptador provisional que existía
 * mientras el módulo de equipos no tenía dominio propio. Ahora que lo tiene,
 * `UsersModule` deja de tocar la tabla `teams` directamente y depende del
 * puerto que `TeamsModule` expone — la misma inversión de dependencias que
 * ya se aplicaba en el resto del sistema, cerrando el último cabo suelto de
 * la migración del módulo de usuario.
 */
@Injectable()
export class TeamsModuleTeamReader implements TeamReader {
  constructor(@Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository) {}

  async findById(teamId: string): Promise<TeamReference | null> {
    const team = await this.teams.findById(teamId);
    if (!team || team.isDeleted) return null;
    return { id: team.id, name: team.name };
  }

  async findManyByIds(teamIds: readonly string[]): Promise<TeamReference[]> {
    const results = await Promise.all(teamIds.map((id) => this.findById(id)));
    return results.filter((team): team is TeamReference => team !== null);
  }
}
