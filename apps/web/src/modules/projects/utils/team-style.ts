/** Colores por área — réplica de `EQUIPO_COLOR_MAP` en `LiderProyectoFicha` (v1). */
const TEAM_COLOR_MAP: Record<string, { color: string; bg: string; sigla: string }> = {
  UX: { color: 'var(--kora-success)', bg: 'var(--kora-success-surface)', sigla: 'UX' },
  'UX-UI': { color: 'var(--kora-success)', bg: 'var(--kora-success-surface)', sigla: 'UX' },
  DEV: { color: 'var(--kora-warning)', bg: 'var(--kora-warning-surface)', sigla: 'DEV' },
  Desarrollo: { color: 'var(--kora-warning)', bg: 'var(--kora-warning-surface)', sigla: 'DEV' },
  RPA: { color: 'var(--kora-success)', bg: 'var(--kora-success-surface)', sigla: 'RPA' },
  IA: { color: 'var(--kora-danger)', bg: 'var(--kora-danger-surface-soft)', sigla: 'IA' },
  QA: { color: 'var(--kora-blue-400)', bg: 'var(--kora-blue-surface-alt)', sigla: 'QA' },
};

export const getTeamStyle = (teamName: string) =>
  TEAM_COLOR_MAP[teamName.toUpperCase()] ?? TEAM_COLOR_MAP[teamName] ?? {
    color: 'var(--kora-blue-600)',
    bg: 'var(--kora-blue-surface-alt)',
    sigla: teamName.slice(0, 3).toUpperCase(),
  };
