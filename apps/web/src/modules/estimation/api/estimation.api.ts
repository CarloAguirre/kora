import type {
  AnalyzeEstimationPocInput,
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

export interface DriveOAuthPocStart {
  authorizationUrl: string;
}

export const estimationApi = {
  driveOAuthPocStatus(): Promise<{ enabled: boolean; serviceAccountEnabled: boolean }> {
    return api.get<{ enabled: boolean; serviceAccountEnabled: boolean }>('/estimations/drive/oauth-poc/status');
  },
  /** Comprueba la concesión efímera sin enviar tokens al navegador. */
  driveOAuthPocAccess(input: { projectId: string; driveFolderUrl: string }): Promise<{ authorized: boolean }> {
    return api.get<{ authorized: boolean }>(
      '/estimations/drive/oauth-poc/access?' + new URLSearchParams({ projectId: input.projectId, driveFolderUrl: input.driveFolderUrl }).toString(),
    );
  },
  /** PoC sin tokens ni credenciales devueltos al navegador. */
  startDriveOAuthPoc(input: { projectId: string; driveFolderUrl: string }): Promise<DriveOAuthPocStart> {
    return api.post<DriveOAuthPocStart>('/estimations/drive/oauth-poc/start', input);
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
  generateAnsweredPocProposal(input: GenerateEstimationPocInput): Promise<EstimationPocProposal> {
    return api.post<EstimationPocProposal>('/estimations/poc/proposal-answered', input);
  },
  generatePocProposal(input: GenerateEstimationPocInput): Promise<EstimationPocProposal> {
    return api.post<EstimationPocProposal>('/estimations/poc/proposal', input);
  },
};

export const estimationKeys = {
  all: ['estimations'] as const,
  questionnaireDefinition: () => [...estimationKeys.all, 'questionnaire-definition'] as const,
  driveResolution: (projectId: string) =>
    [...estimationKeys.all, 'drive-resolution', projectId] as const,
  driveInventory: (driveFolderUrl: string) =>
    [...estimationKeys.all, 'drive-inventory', driveFolderUrl] as const,
  driveFiles: (driveFolderUrl: string) =>
    [...estimationKeys.all, 'drive-files', driveFolderUrl] as const,
};
