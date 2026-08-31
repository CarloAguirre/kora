import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateForecastAssignmentInput,
  ForecastCapacityQuery,
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
