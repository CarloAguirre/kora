import { useEffect, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { ProjectSummary } from '@kora/contracts';
import { projectsApi } from '@/modules/projects/api/projects.api';
import { useProjectsList } from '@/modules/projects/api/projects.queries';
import { HOUR_ENTRY_PROJECT_STATUSES } from '../lib/selectable-project-statuses';

/**
 * Los registros de ejecución mantienen el alcance normal (proyectos propios).
 * Para "Prospecto" se carga el catálogo transversal autorizado por backend,
 * recorriendo TODAS las páginas; no se concede projects:read general.
 */
export function useHourEntryProjectOptions(assignedToUserId?: string) {
  const assigned = useProjectsList({
    page: 1, pageSize: 200, sortField: 'name',
    assignedToUserId, status: HOUR_ENTRY_PROJECT_STATUSES,
  });
  const prospects = useInfiniteQuery({
    queryKey: ['projects', 'hour-entry-prospects', 'all'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => projectsApi.list({
      page: pageParam, pageSize: 200, sortField: 'name',
      hourEntryProspects: 'true',
    }),
    getNextPageParam: (last) => last.page < last.pageCount ? last.page + 1 : undefined,
    staleTime: 30_000,
  });
  useEffect(() => {
    if (prospects.hasNextPage && !prospects.isFetchingNextPage) {
      void prospects.fetchNextPage();
    }
  }, [prospects.hasNextPage, prospects.isFetchingNextPage, prospects.fetchNextPage,
    prospects.data?.pages.length]);

  const items = useMemo(() => {
    const byId = new Map<string, ProjectSummary>();
    for (const item of assigned.data?.items ?? []) byId.set(item.id, item);
    for (const page of prospects.data?.pages ?? []) {
      for (const item of page.items) byId.set(item.id, item);
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'es-CL'));
  }, [assigned.data?.items, prospects.data?.pages]);
  return { items, loading: assigned.isLoading || prospects.isLoading,
    prospectError: prospects.isError };
}
