import { describe, expect, it } from 'vitest';
import type { HourEntrySummary } from '@kora/contracts';
import { canDecideHourEntry, resolvedApprover } from './approver';

const jose = { id: 'jose', role: 'leader' };
const solmary = { id: 'solmary', role: 'leader' };
const admin = { id: 'admin', role: 'admin' };

function entry(approvers: Array<{ id: string; fullName: string }>, project = true): HourEntrySummary {
  return {
    user: { id: 'pablo', fullName: 'Pablo' },
    project: project ? { id: 'pdc', name: 'Soporte PDC' } : null,
    projectApprovers: approvers,
    designatedApprover: null,
  } as HourEntrySummary;
}

describe('Aprobación de horas según autoridad del proyecto', () => {
  it('Soporte PDC: José no aprueba; la líder del proyecto sí', () => {
    const support = entry([{ id: 'solmary', fullName: 'Solmary Castro' }]);
    expect(resolvedApprover(support)?.id).toBe('solmary');
    expect(canDecideHourEntry(support, jose, true)).toBe(false);
    expect(canDecideHourEntry(support, solmary, true)).toBe(true);
    expect(canDecideHourEntry(support, admin, true)).toBe(true);
  });

  it('desarrollo: el líder del equipo asignado sí aprueba', () => {
    const development = entry([{ id: 'jose', fullName: 'José Aponte' }]);
    expect(canDecideHourEntry(development, jose, true)).toBe(true);
    expect(canDecideHourEntry(development, solmary, true)).toBe(false);
  });

  it('sin hours:approve, nadie ve acciones de aprobación', () => {
    const support = entry([{ id: 'solmary', fullName: 'Solmary Castro' }]);
    expect(canDecideHourEntry(support, admin, false)).toBe(false);
    expect(canDecideHourEntry(support, solmary, false)).toBe(false);
  });

  it('un designado heredado no prevalece sobre el aprobador del proyecto', () => {
    const support = {
      ...entry([{ id: 'solmary', fullName: 'Solmary Castro' }]),
      designatedApprover: { id: 'jose', fullName: 'José Aponte' },
    };
    expect(resolvedApprover(support)?.id).toBe('solmary');
    expect(canDecideHourEntry(support, jose, true)).toBe(false);
  });

  it('horas sin proyecto: mantiene designado y líder del autor, no el propio autor', () => {
    const withoutProject = {
      ...entry([], false),
      designatedApprover: { id: 'jose', fullName: 'José Aponte' },
    };
    expect(resolvedApprover(withoutProject)?.id).toBe('jose');
    expect(canDecideHourEntry(withoutProject, jose, true)).toBe(true);
    expect(canDecideHourEntry(withoutProject, solmary, true)).toBe(true);
    expect(canDecideHourEntry(withoutProject, { id: 'pablo', role: 'leader' }, true)).toBe(false);
  });
});
