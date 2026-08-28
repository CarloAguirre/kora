/**
 * Valida que un `teamMemberId` (pertenencia a un equipo) exista y esté activo,
 * antes de asignarlo a un proyecto.
 */
export interface ProjectTeamMemberValidator {
  isActiveTeamMember(teamMemberId: string): Promise<boolean>;
}

export const PROJECT_TEAM_MEMBER_VALIDATOR = Symbol('ProjectTeamMemberValidator');
