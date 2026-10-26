import type { ProjectPhase, ProjectSortField, ProjectStatus } from '@kora/contracts';
import type { SortState } from '@/shared/components/ui/DataTable';
import { DEFAULT_PAGE_SIZE } from '@/shared/components/ui/Pagination';

export const PROJECTS_LIST_PATH = '/proyectos';

/** La categoría Inactivos de la v1 se migró a status 'cancelled' en Kora 2. */
export const SUPPORT_SUB_TABS = [
  { id: 'active', label: 'Activos', status: 'active' },
  { id: 'finished', label: 'Terminados', status: 'finished' },
  { id: 'inactive', label: 'Inactivos', status: 'cancelled' },
] as const satisfies ReadonlyArray<{ id: string; label: string; status: ProjectStatus }>;

export type SupportSubTab = (typeof SUPPORT_SUB_TABS)[number]['id'];

export function supportSubTabStatus(tab: SupportSubTab): ProjectStatus {
  return SUPPORT_SUB_TABS.find((item) => item.id === tab)!.status;
}

/** Por defecto, primero los proyectos con más horas desviadas. */
export const DEFAULT_PROJECTS_SORT: SortState<ProjectSortField> = { field: 'deviationHours', direction: 'desc' };

export interface ProjectsListSearch {
  tab: 'development' | 'support';
  supportSubTab: SupportSubTab;
  search: string;
  leaderUserIds: string[];
  statuses: ProjectStatus[];
  phases: ProjectPhase[];
  page: number;
  pageSize: number;
  sort: SortState<ProjectSortField>;
}

export const DEFAULT_PROJECTS_LIST_SEARCH: ProjectsListSearch = {
  tab: 'development',
  supportSubTab: 'active',
  search: '',
  leaderUserIds: [],
  statuses: [],
  phases: [],
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  sort: DEFAULT_PROJECTS_SORT,
};

/**
 * Último estado del listado (filtros, página, orden) en esta sesión de la SPA.
 * Vive en memoria — no en la URL — y se pierde al recargar. La ficha del
 * proyecto puede llevar a otras pantallas (equipo, vista cliente) antes de
 * volver, así que no basta con `navigate(-1)`.
 */
let lastProjectsListSearch: ProjectsListSearch = DEFAULT_PROJECTS_LIST_SEARCH;

export function rememberProjectsListSearch(state: ProjectsListSearch): void {
  lastProjectsListSearch = state;
}

interface ProjectsListLocationState {
  restoreFilters?: boolean;
}

/**
 * Estado inicial del listado: solo se restauran los filtros cuando se llega
 * desde "Volver a proyectos"; entrar desde el menú lateral muestra el listado
 * limpio.
 */
export function initialProjectsListSearch(locationState: unknown): ProjectsListSearch {
  return (locationState as ProjectsListLocationState | null)?.restoreFilters
    ? lastProjectsListSearch
    : DEFAULT_PROJECTS_LIST_SEARCH;
}

/** `navigate(PROJECTS_LIST_PATH, { state: RESTORE_PROJECTS_LIST_STATE })` vuelve al listado con sus filtros. */
export const RESTORE_PROJECTS_LIST_STATE: ProjectsListLocationState = { restoreFilters: true };
