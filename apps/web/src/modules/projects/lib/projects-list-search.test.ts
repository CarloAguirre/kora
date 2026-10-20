import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECTS_LIST_SEARCH,
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

  it('sin el estado de "Volver" (p. ej. desde el menú) el listado parte limpio', () => {
    rememberProjectsListSearch(filtered);
    expect(initialProjectsListSearch(null)).toEqual(DEFAULT_PROJECTS_LIST_SEARCH);
    expect(initialProjectsListSearch(undefined)).toEqual(DEFAULT_PROJECTS_LIST_SEARCH);
  });
});
