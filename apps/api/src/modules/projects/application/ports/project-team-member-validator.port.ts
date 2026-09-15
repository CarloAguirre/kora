/**
 * Valida que un `teamMemberId` (pertenencia a un equipo) exista y esté activo,
 * antes de asignarlo a un proyecto.
 */
export interface ProjectTeamMemberValidator {
  isActiveTeamMember(teamMemberId: string): Promise<boolean>;
  /** `teamId` de este `teamMemberId` — para verificar liderazgo antes de asignarlo a un proyecto. */
  findTeamId(teamMemberId: string): Promise<string | null>;
}

export const PROJECT_TEAM_MEMBER_VALIDATOR = Symbol('ProjectTeamMemberValidator');
