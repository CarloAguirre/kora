import type {
  EstimationPocProposal,
  EstimationQuestionnaireDefinition,
  GenerateEstimationPocInput,
} from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

export const estimationApi = {
  questionnaireDefinition(): Promise<EstimationQuestionnaireDefinition> {
    return api.get<EstimationQuestionnaireDefinition>('/estimations/questionnaire-definition');
  },
  generatePocProposal(input: GenerateEstimationPocInput): Promise<EstimationPocProposal> {
    return api.post<EstimationPocProposal>('/estimations/poc/proposal', input);
  },
};

export const estimationKeys = {
  all: ['estimations'] as const,
  questionnaireDefinition: () => [...estimationKeys.all, 'questionnaire-definition'] as const,
};
