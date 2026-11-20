import { describe, expect, it } from 'vitest';
import { isProjectTeamLeader } from './project.mapper';

describe('isProjectTeamLeader', () => {
  it('reconoce al líder explícito del equipo', () => {
    expect(isProjectTeamLeader('u-1', { effectiveLeaderUserId: 'u-1' })).toBe(true);
  });

  it('reconoce al líder heredado del equipo cuando no hay override', () => {
    expect(isProjectTeamLeader('u-organico', { effectiveLeaderUserId: 'u-organico' })).toBe(true);
  });

  it('no da permisos de líder de equipo al PM ni a otro equipo por ser PM', () => {
    expect(isProjectTeamLeader('pm-1', { effectiveLeaderUserId: 'u-1' })).toBe(false);
  });

  it('no concede liderazgo a equipos sin líder efectivo', () => {
    expect(isProjectTeamLeader('u-1', { effectiveLeaderUserId: null })).toBe(false);
  });
});
