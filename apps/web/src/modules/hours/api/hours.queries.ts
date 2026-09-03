import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AvailabilityQuery,
  CreateHourEntryInput,
  ListCapacityReportQuery,
  ListHolidaysQuery,
  ListHourEntriesQuery,
  RejectHourEntryInput,
  UpdateHourEntryInput,
} from '@kora/contracts';
import { hourKeys, hoursApi } from './hours.api';

export function useHourEntriesList(query: Partial<ListHourEntriesQuery>) {
  return useQuery({
    queryKey: hourKeys.list(query),
    queryFn: () => hoursApi.list(query),
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  });
}

/** Feriados para las alertas de fin de semana/feriado del modal "Registrar horas". */
export function useHolidays(query: Partial<ListHolidaysQuery>) {
  return useQuery({
    queryKey: hourKeys.holidays(query),
    queryFn: () => hoursApi.holidays(query),
    staleTime: 5 * 60_000,
  });
}

/** Pestaña "Capacity" de Administración. */
export function useCapacityReport(query: Partial<ListCapacityReportQuery>) {
  return useQuery({
    queryKey: hourKeys.capacityReport(query),
    queryFn: () => hoursApi.capacityReport(query),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

/** Pestaña "Registro de Horas" (disponibilidad) de Administración. */
export function useAvailability(query: Partial<AvailabilityQuery>) {
  return useQuery({
    queryKey: hourKeys.availability(query),
    queryFn: () => hoursApi.availability(query),
    placeholderData: (previous) => previous,
    enabled: Boolean(query.dateFrom && query.dateTo),
    staleTime: 30_000,
  });
}

export function useHourEntryDetail(entryId: string | null) {
  return useQuery({
    queryKey: hourKeys.detail(entryId ?? ''),
    queryFn: () => hoursApi.detail(entryId as string),
    enabled: Boolean(entryId),
  });
}

/**
 * Horas que quedaron pendientes EXCLUYENTEMENTE con un líder de equipo, no
 * con el propio líder de proyecto — ver DECISION-M4-HORAS.md. Solo responde
 * algo útil para quien lidera el proyecto (o admin/pmo); el backend rechaza
 * al resto, así que el llamador debe pasar `enabled` acorde.
 */
export function useProjectPendingApprovals(projectId: string | null, enabled = true) {
  return useQuery({
    queryKey: hourKeys.projectPendingApprovals(projectId ?? ''),
    queryFn: () => hoursApi.projectPendingApprovals(projectId as string),
    enabled: Boolean(projectId) && enabled,
    staleTime: 30_000,
  });
}

function useInvalidateHourEntries() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: hourKeys.all });
    // El Dashboard resume horas/aprobaciones: sin esto quedaba desactualizado
    // hasta que el usuario recargaba la página a mano.
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useCreateHourEntry() {
  const invalidate = useInvalidateHourEntries();
  return useMutation({
    mutationFn: (input: CreateHourEntryInput) => hoursApi.create(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateHourEntry() {
  const invalidate = useInvalidateHourEntries();
  return useMutation({
    mutationFn: ({ entryId, input }: { entryId: string; input: UpdateHourEntryInput }) => hoursApi.update(entryId, input),
    onSuccess: () => invalidate(),
  });
}

export function useApproveHourEntry() {
  const invalidate = useInvalidateHourEntries();
  return useMutation({
    mutationFn: (entryId: string) => hoursApi.approve(entryId),
    onSuccess: () => invalidate(),
  });
}

export function useRejectHourEntry() {
  const invalidate = useInvalidateHourEntries();
  return useMutation({
    mutationFn: ({ entryId, input }: { entryId: string; input: RejectHourEntryInput }) => hoursApi.reject(entryId, input),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteHourEntry() {
  const invalidate = useInvalidateHourEntries();
  return useMutation({
    mutationFn: (entryId: string) => hoursApi.remove(entryId),
    onSuccess: () => invalidate(),
  });
}
