import { describe, expect, it } from 'vitest';
import { hourEntryAssignmentLabel } from './assignment-label';

const project = (type: string, salesStage: string | null) => ({ id: '00000000-0000-0000-0000-000000000001', name: 'P', type, salesStage });

describe('hourEntryAssignmentLabel', () => {
  it('con proyecto usa la etapa comercial actual, no lo elegido al registrar', () => {
    expect(hourEntryAssignmentLabel({ assignment: 'Prospecto', project: project('development', 'approved') })).toBe('Proyecto');
    expect(hourEntryAssignmentLabel({ assignment: 'Proyecto', project: project('development', 'prospect') })).toBe('Prospecto');
    expect(hourEntryAssignmentLabel({ assignment: 'Prospecto', project: project('development', 'quoted') })).toBe('Cotización');
    expect(hourEntryAssignmentLabel({ assignment: 'Proyecto', project: project('support', null) })).toBe('Soporte');
  });

  it('sin proyecto (o sin datos del proyecto) muestra la asignación guardada', () => {
    expect(hourEntryAssignmentLabel({ assignment: 'Vacaciones', project: null })).toBe('Vacaciones');
    expect(hourEntryAssignmentLabel({ assignment: null, project: null })).toBe('Desarrollo');
    expect(hourEntryAssignmentLabel({ assignment: 'Prospecto', project: { id: project('x', null).id, name: 'P' } })).toBe('Prospecto');
  });
});
