import type {
  AnalyzeEstimationPocInput,
  GoogleDriveConnectionStatus,
  GoogleDriveConnectResponse,
  EstimationDriveFolderListing,
  EstimationDriveFolderResolution,
  EstimationDriveInventory,
  EstimationPocAnalysis,
  EstimationPocProposal,
  EstimationQuestionnaireDefinition,
  GenerateEstimationPocInput,
  InventoryEstimationDriveInput,
  ListEstimationDriveFilesInput,
  ResolveEstimationDriveFolderInput,
} from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

export const estimationApi = {
  driveConnectionStatus(): Promise<GoogleDriveConnectionStatus> {
    return api.get<GoogleDriveConnectionStatus>('/auth/google/drive/status');
  },
  startDriveConnection(
    returnTo: string,
  ): Promise<GoogleDriveConnectResponse> {
    return api.post<GoogleDriveConnectResponse>(
      '/auth/google/drive/connect',
      { returnTo },
    );
  },
  questionnaireDefinition(): Promise<EstimationQuestionnaireDefinition> {
    return api.get<EstimationQuestionnaireDefinition>('/estimations/questionnaire-definition');
  },
  resolveDriveFolder(
    input: ResolveEstimationDriveFolderInput,
  ): Promise<EstimationDriveFolderResolution> {
    return api.post<EstimationDriveFolderResolution>('/estimations/drive/resolve', input);
  },
  inventoryDrive(
    input: InventoryEstimationDriveInput,
  ): Promise<EstimationDriveInventory> {
    return api.post<EstimationDriveInventory>('/estimations/drive/inventory', input);
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
  driveConnection: () =>
    [...estimationKeys.all, 'drive-connection'] as const,
  questionnaireDefinition: () => [...estimationKeys.all, 'questionnaire-definition'] as const,
  driveResolution: (projectId: string) =>
    [...estimationKeys.all, 'drive-resolution', projectId] as const,
  driveInventory: (driveFolderUrl: string) =>
    [...estimationKeys.all, 'drive-inventory', driveFolderUrl] as const,
  driveFiles: (driveFolderUrl: string) =>
    [...estimationKeys.all, 'drive-files', driveFolderUrl] as const,
};
