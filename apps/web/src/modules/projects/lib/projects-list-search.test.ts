import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECTS_LIST_SEARCH,
  SUPPORT_SUB_TABS,
  SUPPORT_STATUS_OPTIONS,
  supportProjectStatusLabel,
  supportSubTabForStatus,
  supportSubTabStatuses,
  RESTORE_PROJECTS_LIST_STATE,
  initialProjectsListSearch,
  rememberProjectsListSearch,
} from './projects-list-search';
import { getProjectStageLabel } from './project-stage-display';

describe('projects-list-search', () => {
  const filtered = { ...DEFAULT_PROJECTS_LIST_SEARCH, leaderUserIds: ['u1'], page: 2 };

  it('restaura los filtros guardados al volver desde la ficha', () => {
    rememberProjectsListSearch(filtered);
    expect(initialProjectsListSearch(RESTORE_PROJECTS_LIST_STATE)).toEqual(filtered);
  });

  it('Soporte tiene Activos, Terminados e Inactivos en ese orden', () => {
    expect(SUPPORT_SUB_TABS.map(({ id, label }) => [id, label])).toEqual([
      ['active', 'Activos'],
      ['finished', 'Terminados'],
      ['inactive', 'Inactivos'],
    ]);
  });

  it('cada soporte no terminado pertenece a una pestaña según su estado', () => {
    expect(supportSubTabStatuses('active')).toEqual(['active']);
    expect(supportSubTabStatuses('finished')).toEqual(['finished']);
    expect(supportSubTabStatuses('inactive')).toEqual(['draft', 'on_hold', 'cancelled']);
  });

  it('la ficha y el listado muestran las mismas tres categorías de soporte', () => {
    expect(SUPPORT_STATUS_OPTIONS.map(({ label }) => label)).toEqual(['Activo', 'Inactivo', 'Terminado']);
    for (const [status, tab, label] of [
      ['active', 'active', 'Activo'],
      ['draft', 'inactive', 'Inactivo'],
      ['on_hold', 'inactive', 'Inactivo'],
      ['cancelled', 'inactive', 'Inactivo'],
      ['finished', 'finished', 'Terminado'],
    ] as const) {
      expect(supportSubTabForStatus(status)).toBe(tab);
      expect(supportProjectStatusLabel(status)).toBe(label);
      expect(getProjectStageLabel({ type: 'support', status, salesStage: null, phase: null })).toBe(label);
    }
    expect(getProjectStageLabel({ type: 'development', status: 'on_hold', salesStage: 'approved', phase: null })).toBe('Detenido');
  });

  it('restaura la pestaña Inactivos cuando se vuelve desde una ficha', () => {
    const inactiveSearch = { ...DEFAULT_PROJECTS_LIST_SEARCH, tab: 'support' as const, supportSubTab: 'inactive' as const };
    rememberProjectsListSearch(inactiveSearch);
    expect(initialProjectsListSearch(RESTORE_PROJECTS_LIST_STATE).supportSubTab).toBe('inactive');
    expect(initialProjectsListSearch(null).supportSubTab).toBe('active');
  });

  it('sin el estado de "Volver" (p. ej. desde el menú) el listado parte limpio', () => {
    rememberProjectsListSearch(filtered);
    expect(initialProjectsListSearch(null)).toEqual(DEFAULT_PROJECTS_LIST_SEARCH);
    expect(initialProjectsListSearch(undefined)).toEqual(DEFAULT_PROJECTS_LIST_SEARCH);
  });
});
