import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECTS_LIST_SEARCH,
  SUPPORT_SUB_TABS,
  supportSubTabStatus,
  RESTORE_PROJECTS_LIST_STATE,
  initialProjectsListSearch,
  rememberProjectsListSearch,
} from './projects-list-search';

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

  it('Inactivos corresponde a cancelled, no a vencimiento de contrato', () => {
    expect(supportSubTabStatus('active')).toBe('active');
    expect(supportSubTabStatus('finished')).toBe('finished');
    expect(supportSubTabStatus('inactive')).toBe('cancelled');
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
