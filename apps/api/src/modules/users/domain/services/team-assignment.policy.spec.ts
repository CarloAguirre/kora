import { describe, expect, it } from 'vitest';
import { TeamAssignmentPolicy } from './team-assignment.policy';

describe('TeamAssignmentPolicy', () => {
  it('exige equipo a los colaboradores', () => {
    expect(TeamAssignmentPolicy.validate('collaborator', null).isErr()).toBe(true);
    expect(TeamAssignmentPolicy.validate('collaborator', 'team-1').isOk()).toBe(true);
  });

  it('deja el equipo opcional para los líderes', () => {
    // Un líder puede serlo solo de proyectos (PM) y no tener equipo propio.
    expect(TeamAssignmentPolicy.validate('leader', null).isOk()).toBe(true);
    expect(TeamAssignmentPolicy.validate('leader', 'team-1').isOk()).toBe(true);
  });

  it.each(['admin', 'pmo', 'commercial'] as const)('prohíbe equipo al rol %s', (role) => {
    expect(TeamAssignmentPolicy.validate(role, 'team-1').isErr()).toBe(true);
    expect(TeamAssignmentPolicy.validate(role, null).isOk()).toBe(true);
  });

  it('al normalizar, retira el equipo de los roles que no lo admiten', () => {
    // Promover a un colaborador a administrador no debe fallar: debe soltar el
    // equipo, que es lo que espera quien hace el cambio.
    expect(TeamAssignmentPolicy.normalizeTeamForRole('admin', 'team-1')).toBeNull();
    expect(TeamAssignmentPolicy.normalizeTeamForRole('collaborator', 'team-1')).toBe('team-1');
  });

  it('el selector de equipo solo se muestra donde tiene sentido', () => {
    expect(TeamAssignmentPolicy.showsTeamSelector('collaborator')).toBe(true);
    expect(TeamAssignmentPolicy.showsTeamSelector('leader')).toBe(true);
    expect(TeamAssignmentPolicy.showsTeamSelector('admin')).toBe(false);
  });
});
