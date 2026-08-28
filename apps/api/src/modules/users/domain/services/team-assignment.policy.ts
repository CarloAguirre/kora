import { ROLE_LABELS, type RoleCode } from '@kora/contracts';
import { err, ok, type Result } from '@kora/core';
import { TeamNotAllowedForRoleError, TeamRequiredForRoleError } from '../errors/user.errors';

/**
 * Qué roles pueden (o deben) pertenecer a un equipo.
 *
 * En la v1 esta regla era una lista de etiquetas en español dentro de un
 * archivo de constantes del front (`ROLES_CON_EQUIPO = ['Colaborador', 'Líder
 * de equipo']`), comparada contra el nombre visible del rol. Renombrar un rol
 * en la tabla `rol` habría roto la validación en silencio. Aquí la regla vive
 * en el dominio, se expresa contra códigos inmutables y el servidor la aplica
 * aunque el formulario no lo haga.
 */

export type TeamRequirement = 'required' | 'optional' | 'forbidden';

const TEAM_REQUIREMENT_BY_ROLE: Readonly<Record<RoleCode, TeamRequirement>> = {
  admin: 'forbidden',
  pmo: 'forbidden',
  // Un líder puede serlo de equipo, de proyecto o de ambos: solo en el primer
  // caso tiene equipo, y eso se deriva de sus asignaciones reales.
  leader: 'optional',
  collaborator: 'required',
  commercial: 'forbidden',
};

export class TeamAssignmentPolicy {
  static requirementFor(role: RoleCode): TeamRequirement {
    return TEAM_REQUIREMENT_BY_ROLE[role];
  }

  static showsTeamSelector(role: RoleCode): boolean {
    return TeamAssignmentPolicy.requirementFor(role) !== 'forbidden';
  }

  static validate(
    role: RoleCode,
    teamId: string | null,
  ): Result<void, TeamRequiredForRoleError | TeamNotAllowedForRoleError> {
    const requirement = TeamAssignmentPolicy.requirementFor(role);

    if (requirement === 'required' && !teamId) {
      return err(new TeamRequiredForRoleError(ROLE_LABELS[role]));
    }
    if (requirement === 'forbidden' && teamId) {
      return err(new TeamNotAllowedForRoleError(ROLE_LABELS[role]));
    }

    return ok(undefined);
  }

  /** Al cambiar a un rol que no admite equipo, la pertenencia se retira sola en
   *  lugar de rechazar la operación: es lo que el administrador espera. */
  static normalizeTeamForRole(role: RoleCode, teamId: string | null): string | null {
    return TeamAssignmentPolicy.requirementFor(role) === 'forbidden' ? null : teamId;
  }
}
