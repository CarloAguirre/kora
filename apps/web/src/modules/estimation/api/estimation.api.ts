import type {
  AnalyzeEstimationPocInput,
  EstimationDriveFolderListing,
  EstimationPocAnalysis,
  EstimationPocProposal,
  EstimationQuestionnaireDefinition,
  GenerateEstimationPocInput,
  ListEstimationDriveFilesInput,
} from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

export const estimationApi = {
  questionnaireDefinition(): Promise<EstimationQuestionnaireDefinition> {
    return api.get<EstimationQuestionnaireDefinition>('/estimations/questionnaire-definition');
  },
  driveFiles(input: ListEstimationDriveFilesInput): Promise<EstimationDriveFolderListing> {
    return api.post<EstimationDriveFolderListing>('/estimations/drive/files', input);
  },
  analyzePoc(input: AnalyzeEstimationPocInput): Promise<EstimationPocAnalysis> {
    return api.post<EstimationPocAnalysis>('/estimations/poc/analyze', input);
  },
  generatePocProposal(input: GenerateEstimationPocInput): Promise<EstimationPocProposal> {
    return api.post<EstimationPocProposal>('/estimations/poc/proposal', input);
  },
};

export const estimationKeys = {
  all: ['estimations'] as const,
  questionnaireDefinition: () => [...estimationKeys.all, 'questionnaire-definition'] as const,
  driveFiles: (driveFolderUrl: string) =>
    [...estimationKeys.all, 'drive-files', driveFolderUrl] as const,
};
