import { describe, expect, it } from 'vitest';
import { canManageProjectTeam } from './project.mapper';

describe('canManageProjectTeam', () => {
  const actor = (actorUserId: string, canManagePendings = false) =>
    ({ actorUserId, canManagePendings });

  it('permite al líder del proyecto gestionar cualquiera de sus equipos, aunque otro sea su líder', () => {
    expect(canManageProjectTeam(actor('pm-1', true), { effectiveLeaderUserId: 'leader-dev' })).toBe(true);
  });

  it('permite gestionar su equipo al líder efectivo, incluyendo el heredado del catálogo', () => {
    expect(canManageProjectTeam(actor('leader-dev'), { effectiveLeaderUserId: 'leader-dev' })).toBe(true);
  });

  it('no permite gestionar un equipo ajeno por liderar otro equipo del proyecto', () => {
    expect(canManageProjectTeam(actor('leader-ux'), { effectiveLeaderUserId: 'leader-dev' })).toBe(false);
  });

  it('no concede edición cuando el equipo no tiene líder efectivo ni el actor administra el proyecto', () => {
    expect(canManageProjectTeam(actor('collaborator'), { effectiveLeaderUserId: null })).toBe(false);
  });
});
