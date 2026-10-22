import { useProjectDetail } from '@/modules/projects/api/projects.queries';

export function useEstimationWorkspace(projectId: string | null) {
  const project = useProjectDetail(projectId);

  return {
    project,
    isLoading: project.isLoading,
  };
}
