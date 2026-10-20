import {
  PROJECT_PHASES,
  PROJECT_STATUSES,
  projectSortFieldSchema,
  type ProjectPhase,
  type ProjectSortField,
  type ProjectStatus,
} from '@kora/contracts';
import type { SortState } from '@/shared/components/ui/DataTable';
import { DEFAULT_PAGE_SIZE } from '@/shared/components/ui/Pagination';

export const PROJECTS_LIST_PATH = '/proyectos';

/** Por defecto, primero los proyectos con más horas desviadas. */
export const DEFAULT_PROJECTS_SORT: SortState<ProjectSortField> = { field: 'deviationHours', direction: 'desc' };

export interface ProjectsListSearch {
  tab: 'development' | 'support';
  supportSubTab: 'active' | 'finished';
  search: string;
  leaderUserIds: string[];
  statuses: ProjectStatus[];
  phases: ProjectPhase[];
  page: number;
  pageSize: number;
  sort: SortState<ProjectSortField>;
}

const positiveInt = (value: string | null, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Los filtros del listado viven en la URL (`/proyectos?tab=…&lider=…`) para
 * que sobrevivan a entrar a la ficha de un proyecto y volver — con estado
 * local, el "Volver a proyectos" remontaba la página y se perdían.
 */
export function parseProjectsListSearch(params: URLSearchParams): ProjectsListSearch {
  const statuses = new Set<string>(PROJECT_STATUSES);
  const phases = new Set<string>(PROJECT_PHASES);
  const sortField = projectSortFieldSchema.safeParse(params.get('orden')).data;
  const sortDirection = params.get('dir');
  return {
    tab: params.get('tab') === 'soporte' ? 'support' : 'development',
    supportSubTab: params.get('subtab') === 'terminados' ? 'finished' : 'active',
    search: params.get('q') ?? '',
    leaderUserIds: params.getAll('lider'),
    statuses: params.getAll('estado').filter((s): s is ProjectStatus => statuses.has(s)),
    phases: params.getAll('etapa').filter((p): p is ProjectPhase => phases.has(p)),
    page: positiveInt(params.get('pagina'), 1),
    pageSize: positiveInt(params.get('tamano'), DEFAULT_PAGE_SIZE),
    sort:
      sortField && (sortDirection === 'asc' || sortDirection === 'desc')
        ? { field: sortField, direction: sortDirection }
        : DEFAULT_PROJECTS_SORT,
  };
}

/** Solo escribe lo que difiere del valor por defecto, para que la URL quede limpia. */
export function serializeProjectsListSearch(state: ProjectsListSearch): URLSearchParams {
  const params = new URLSearchParams();
  if (state.tab === 'support') params.set('tab', 'soporte');
  if (state.tab === 'support' && state.supportSubTab === 'finished') params.set('subtab', 'terminados');
  if (state.search) params.set('q', state.search);
  state.leaderUserIds.forEach((id) => params.append('lider', id));
  state.statuses.forEach((s) => params.append('estado', s));
  state.phases.forEach((p) => params.append('etapa', p));
  if (state.page !== 1) params.set('pagina', String(state.page));
  if (state.pageSize !== DEFAULT_PAGE_SIZE) params.set('tamano', String(state.pageSize));
  if (state.sort.field !== DEFAULT_PROJECTS_SORT.field || state.sort.direction !== DEFAULT_PROJECTS_SORT.direction) {
    params.set('orden', state.sort.field);
    params.set('dir', state.sort.direction);
  }
  return params;
}

/**
 * Última búsqueda del listado en esta sesión de la SPA. La ficha del proyecto
 * puede llevar a otras pantallas (equipo, vista cliente) antes de volver, así
 * que no basta con `navigate(-1)` ni con pasar el filtro en `location.state`.
 */
let lastProjectsListSearch = '';

export function rememberProjectsListSearch(search: string): void {
  lastProjectsListSearch = search;
}

/** Ruta del listado con los filtros que el usuario tenía aplicados. */
export function projectsListPath(): string {
  return `${PROJECTS_LIST_PATH}${lastProjectsListSearch}`;
}
