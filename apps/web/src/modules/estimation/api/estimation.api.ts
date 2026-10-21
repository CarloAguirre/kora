import type { EstimationQuestionnaireDefinition } from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

export const estimationApi = {
  questionnaireDefinition(): Promise<EstimationQuestionnaireDefinition> {
    return api.get<EstimationQuestionnaireDefinition>('/estimations/questionnaire-definition');
  },
};

export const estimationKeys = {
  all: ['estimations'] as const,
  questionnaireDefinition: () => [...estimationKeys.all, 'questionnaire-definition'] as const,
};
