import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateForecastAssignmentInput,
  ForecastCapacityQuery,
  ForecastLoadPreviewInput,
  ForecastOverloadWarning,
  ForecastWeeksQuery,
  ListForecastAssignmentsQuery,
  ListForecastHistoryQuery,
  UpdateForecastAssignmentInput,
} from '@kora/contracts';
import { forecastApi, forecastKeys } from './forecast.api';

export function useForecastAssignments(query: ListForecastAssignmentsQuery | null) {
  return useQuery({
    queryKey: query ? forecastKeys.assignments(query) : forecastKeys.all,
    queryFn: () => forecastApi.listAssignments(query as ListForecastAssignmentsQuery),
    enabled: Boolean(query),
  });
}

export function useForecastCapacity(query: ForecastCapacityQuery | null) {
  return useQuery({
    queryKey: query ? forecastKeys.capacity(query) : forecastKeys.all,
    queryFn: () => forecastApi.getCapacity(query as ForecastCapacityQuery),
    enabled: Boolean(query),
  });
}

export function useForecastWeeks(query: ForecastWeeksQuery | null) {
  return useQuery({
    queryKey: query ? forecastKeys.weeks(query) : forecastKeys.all,
    queryFn: () => forecastApi.getWeeks(query as ForecastWeeksQuery),
    enabled: Boolean(query),
  });
}

/**
 * ¿Lo que se está cargando (tramo o tarea) deja a alguien sobre el 100 %? Espera a que el formulario
 * deje de cambiar medio segundo antes de preguntar, para no consultar con cada tecla.
 */
export function useForecastLoadPreview(input: ForecastLoadPreviewInput | null) {
  const serialized = input ? JSON.stringify(input) : null;
  const [debounced, setDebounced] = useState(serialized);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(serialized), 500);
    return () => clearTimeout(timer);
  }, [serialized]);

  const query = debounced ? (JSON.parse(debounced) as ForecastLoadPreviewInput) : null;
  return useQuery({
    queryKey: query ? forecastKeys.loadPreview(query) : [...forecastKeys.all, 'load-preview', null],
    queryFn: () => forecastApi.previewLoad(query as ForecastLoadPreviewInput),
    enabled: Boolean(query),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

/**
 * Para el momento de guardar: consulta (o reutiliza si es reciente) la sobrecarga de lo que se va a
 * guardar, sin depender de la espera del aviso en pantalla. Si la consulta falla, no frena el guardado.
 */
export function useCheckForecastOverload() {
  const queryClient = useQueryClient();
  return async (input: ForecastLoadPreviewInput | null): Promise<ForecastOverloadWarning[]> => {
    if (!input) return [];
    try {
      const result = await queryClient.fetchQuery({
        queryKey: forecastKeys.loadPreview(input),
        queryFn: () => forecastApi.previewLoad(input),
        staleTime: 30_000,
      });
      return result.warnings;
    } catch {
      return [];
    }
  };
}

export function useForecastHistory(query: ListForecastHistoryQuery | null) {
  return useQuery({
    queryKey: query ? forecastKeys.history(query) : forecastKeys.all,
    queryFn: () => forecastApi.listHistory(query as ListForecastHistoryQuery),
    enabled: Boolean(query),
  });
}

function useInvalidateForecast() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: forecastKeys.all });
    // El Dashboard resume "Capacidad y Planificación" con datos de Forecast:
    // sin esto quedaba desactualizado hasta que el usuario recargaba la
    // página a mano.
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useCreateForecastAssignment() {
  const invalidate = useInvalidateForecast();
  return useMutation({
    mutationFn: (input: CreateForecastAssignmentInput) => forecastApi.createAssignment(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateForecastAssignment() {
  const invalidate = useInvalidateForecast();
  return useMutation({
    mutationFn: ({ assignmentId, input }: { assignmentId: string; input: UpdateForecastAssignmentInput }) =>
      forecastApi.updateAssignment(assignmentId, input),
    onSuccess: () => invalidate(),
  });
}

export function useRemoveForecastAssignment() {
  const invalidate = useInvalidateForecast();
  return useMutation({
    mutationFn: (assignmentId: string) => forecastApi.removeAssignment(assignmentId),
    onSuccess: () => invalidate(),
  });
}

/** "Volver al cálculo" / "Usar el nuevo cálculo" sobre una fila calculada. */
export function useResetForecastAssignment() {
  const invalidate = useInvalidateForecast();
  return useMutation({
    mutationFn: (assignmentId: string) => forecastApi.resetAssignment(assignmentId),
    onSuccess: () => invalidate(),
  });
}

/** "Mantener mi ajuste" sobre una fila desfasada. */
export function useKeepForecastAdjustment() {
  const invalidate = useInvalidateForecast();
  return useMutation({
    mutationFn: (assignmentId: string) => forecastApi.keepAdjustment(assignmentId),
    onSuccess: () => invalidate(),
  });
}

/** "Recalcular desde proyectos". */
export function useRecalculateForecast() {
  const invalidate = useInvalidateForecast();
  return useMutation({
    mutationFn: () => forecastApi.recalculate(),
    onSuccess: () => invalidate(),
  });
}
