import { useProjectDetail } from '@/modules/projects/api/projects.queries';
import { useEstimationQuestionnaireDefinition } from '../api/estimation.queries';

export function useEstimationWorkspace(projectId: string | null) {
  const project = useProjectDetail(projectId);
  const questionnaire = useEstimationQuestionnaireDefinition();

  return {
    project,
    questionnaire,
    isLoading: project.isLoading || questionnaire.isLoading,
  };
}
