import type {
  CreateForecastAssignmentInput,
  ForecastAssignment,
  ForecastCapacityQuery,
  ForecastCapacityResponse,
  ForecastHistoryEntry,
  ForecastLoadPreviewInput,
  ForecastLoadPreviewResponse,
  ForecastRecalculateResponse,
  ForecastWeeksQuery,
  ForecastWeeksResponse,
  ListForecastAssignmentsQuery,
  ListForecastHistoryQuery,
  UpdateForecastAssignmentInput,
} from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

export const forecastApi = {
  listAssignments(query: ListForecastAssignmentsQuery): Promise<ForecastAssignment[]> {
    return api.get<ForecastAssignment[]>('/forecast/assignments', { ...query });
  },
  getCapacity(query: ForecastCapacityQuery): Promise<ForecastCapacityResponse> {
    return api.get<ForecastCapacityResponse>('/forecast/capacity', { ...query });
  },
  getWeeks(query: ForecastWeeksQuery): Promise<ForecastWeeksResponse> {
    return api.get<ForecastWeeksResponse>('/forecast/weeks', { ...query });
  },
  listHistory(query: ListForecastHistoryQuery): Promise<ForecastHistoryEntry[]> {
    return api.get<ForecastHistoryEntry[]>('/forecast/history', { ...query });
  },
  createAssignment(input: CreateForecastAssignmentInput): Promise<{ id: string }> {
    return api.post<{ id: string }>('/forecast/assignments', input);
  },
  updateAssignment(assignmentId: string, input: UpdateForecastAssignmentInput): Promise<void> {
    return api.patch<void>(`/forecast/assignments/${assignmentId}`, input);
  },
  removeAssignment(assignmentId: string): Promise<void> {
    return api.delete<void>(`/forecast/assignments/${assignmentId}`);
  },
  resetAssignment(assignmentId: string): Promise<void> {
    return api.post<void>(`/forecast/assignments/${assignmentId}/reset`, {});
  },
  keepAdjustment(assignmentId: string): Promise<void> {
    return api.post<void>(`/forecast/assignments/${assignmentId}/keep`, {});
  },
  previewLoad(input: ForecastLoadPreviewInput): Promise<ForecastLoadPreviewResponse> {
    return api.post<ForecastLoadPreviewResponse>('/forecast/load-preview', input);
  },
  recalculate(): Promise<ForecastRecalculateResponse> {
    return api.post<ForecastRecalculateResponse>('/forecast/recalculate', {});
  },
};

export const forecastKeys = {
  all: ['forecast'] as const,
  assignments: (query: ListForecastAssignmentsQuery) => [...forecastKeys.all, 'assignments', query] as const,
  capacity: (query: ForecastCapacityQuery) => [...forecastKeys.all, 'capacity', query] as const,
  weeks: (query: ForecastWeeksQuery) => [...forecastKeys.all, 'weeks', query] as const,
  loadPreview: (input: ForecastLoadPreviewInput) => [...forecastKeys.all, 'load-preview', input] as const,
  history: (query: ListForecastHistoryQuery) => [...forecastKeys.all, 'history', query] as const,
};
