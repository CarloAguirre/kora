export interface ForecastTeamReference {
  readonly id: string;
  readonly name: string;
  readonly leaderUserId: string | null;
}

export interface ForecastTeamMemberReference {
  readonly id: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly userId: string;
  readonly fullName: string;
  /** Capacidad semanal comprometida — ver docs/DECISION-M6-FORECAST.md. */
  readonly weeklyHours: number;
}

export interface ForecastTeamReader {
  findTeamById(teamId: string): Promise<ForecastTeamReference | null>;
  findMemberById(teamMemberId: string): Promise<ForecastTeamMemberReference | null>;
  /** Miembros activos del equipo, sin líderes, PMO ni admin (`isForecastAssignableRole`) ni usuarios deshabilitados/bloqueados. */
  listActiveMembers(teamId: string): Promise<ForecastTeamMemberReference[]>;
  /** Todos los miembros activos de todos los equipos (sin líderes, PMO ni admin, ni usuarios deshabilitados/bloqueados) — para la vista de capacidad org-wide. */
  listAllActiveMembers(): Promise<ForecastTeamMemberReference[]>;
  /**
   * ¿Lidera `userId` el equipo `teamId`? — mismo criterio ampliado que usa
   * `GET /teams?leaderUserId=me` para decidir qué equipos ve el líder en
   * Forecast: líder oficial del equipo o líder de al menos un proyecto
   * asignado a él (ver docs/DECISION-M6-FORECAST.md).
   */
  isTeamLeader(teamId: string, userId: string): Promise<boolean>;
}

export const FORECAST_TEAM_READER = Symbol('ForecastTeamReader');
