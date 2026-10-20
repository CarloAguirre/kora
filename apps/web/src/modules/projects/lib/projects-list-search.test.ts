import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE } from '@/shared/components/ui/Pagination';
import {
  DEFAULT_PROJECTS_SORT,
  parseProjectsListSearch,
  projectsListPath,
  rememberProjectsListSearch,
  serializeProjectsListSearch,
} from './projects-list-search';

describe('projects-list-search', () => {
  it('sin parámetros usa los valores por defecto y serializa a una URL vacía', () => {
    const state = parseProjectsListSearch(new URLSearchParams());
    expect(state).toEqual({
      tab: 'development',
      supportSubTab: 'active',
      search: '',
      leaderUserIds: [],
      statuses: [],
      phases: [],
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: DEFAULT_PROJECTS_SORT,
    });
    expect(serializeProjectsListSearch(state).toString()).toBe('');
  });

  it('conserva los líderes y demás filtros en ida y vuelta', () => {
    const params = new URLSearchParams('lider=u1&lider=u2&estado=active&q=kora&pagina=3&orden=name&dir=asc');
    const state = parseProjectsListSearch(params);
    expect(state.leaderUserIds).toEqual(['u1', 'u2']);
    expect(state.statuses).toEqual(['active']);
    expect(state.page).toBe(3);
    expect(state.sort).toEqual({ field: 'name', direction: 'asc' });
    expect(parseProjectsListSearch(serializeProjectsListSearch(state))).toEqual(state);
  });

  it('descarta valores inválidos de la URL', () => {
    const state = parseProjectsListSearch(new URLSearchParams('estado=nope&pagina=-2&orden=hack&dir=asc'));
    expect(state.statuses).toEqual([]);
    expect(state.page).toBe(1);
    expect(state.sort).toEqual(DEFAULT_PROJECTS_SORT);
  });

  it('el "Volver" apunta al listado con la última búsqueda', () => {
    rememberProjectsListSearch('?lider=u1');
    expect(projectsListPath()).toBe('/proyectos?lider=u1');
    rememberProjectsListSearch('');
    expect(projectsListPath()).toBe('/proyectos');
  });
});
