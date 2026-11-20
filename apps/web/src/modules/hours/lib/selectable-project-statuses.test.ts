import { describe, expect, it } from 'vitest';
import type { ProjectSummary } from '@kora/contracts';
import { filterHourEntryProjects } from './selectable-project-statuses';

const fixture = (
  id: string, type: ProjectSummary['type'], salesStage: ProjectSummary['salesStage'],
  status: ProjectSummary['status'] = 'active',
): ProjectSummary => ({
  id, type, salesStage, status,
} as ProjectSummary);

const rows = [
  fixture('prospect', 'development', 'prospect'),
  fixture('quoted', 'development', 'quoted'),
  fixture('approved', 'development', 'approved'),
  fixture('support', 'support', null),
  fixture('closed-prospect', 'development', 'prospect', 'finished'),
];

describe('filtro de proyectos según asignación de HH', () => {
  it('Prospecto incluye exclusivamente Prospecto y Cotización no finalizados', () => {
    expect(filterHourEntryProjects(rows, 'Prospecto').map((p) => p.id))
      .toEqual(['prospect', 'quoted']);
  });
  it('Proyecto incluye Aprobado y Soporte, no Prospecto/Cotización', () => {
    expect(filterHourEntryProjects(rows, 'Proyecto').map((p) => p.id))
      .toEqual(['approved', 'support']);
  });
  it('asignaciones ajenas a proyectos no dan opciones', () => {
    expect(filterHourEntryProjects(rows, 'Vacaciones')).toEqual([]);
  });
});
