export interface HourEntryTeamReader {
  /** ¿`leaderUserId` lidera algún equipo al que pertenece `memberUserId`? */
  isTeamLeaderOfMember(leaderUserId: string, memberUserId: string): Promise<boolean>;
  /** Ids de usuarios que pertenecen a algún equipo liderado por `leaderUserId` — alcance de `hours:read_team`. */
  findTeamMemberUserIds(leaderUserId: string): Promise<string[]>;
  /** Equipo activo de un usuario — para mostrarlo en el detalle de un registro de horas. */
  findTeamForUser(userId: string): Promise<{ id: string; name: string } | null>;
}

export const HOUR_ENTRY_TEAM_READER = Symbol('HourEntryTeamReader');
