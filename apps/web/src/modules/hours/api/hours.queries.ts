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

function useInvalidateHourEntries() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: hourKeys.all });
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
