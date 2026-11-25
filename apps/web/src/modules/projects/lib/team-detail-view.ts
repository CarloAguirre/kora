/**
 * El seguimiento del PM es distinto a la gestión del líder del equipo.
 * Si la misma persona tiene ambos roles, prima su gestión de equipo.
 */
export function shouldShowProjectManagerTeamView(
  isProjectManager: boolean,
  isTeamLeader: boolean,
): boolean {
  return isProjectManager && !isTeamLeader;
}
