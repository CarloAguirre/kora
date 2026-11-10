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
import { api, apiEventStream } from '@/shared/lib/api-client';

export interface DriveOAuthPocStart {
  authorizationUrl: string;
}

export interface DriveBrowseFolder {
  id: string;
  name: string;
  url: string;
  modifiedAt: string | null;
}
export interface DriveBrowseDocument {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  modifiedAt: string | null;
}
export interface DriveBrowseResult {
  folder: DriveBrowseFolder;
  parentFolder: DriveBrowseFolder | null;
  siblingFolders: DriveBrowseFolder[];
  childFolders: DriveBrowseFolder[];
  documents: DriveBrowseDocument[];
  coverage: {
    scannedItems: number;
    eligibleDocuments: number;
    analyzedDocuments: number;
    scanTruncated: boolean;
    omitted: Array<{ path: string; reason: string }>;
  } | null;
  siblingsUnavailable: boolean;
}

export const estimationApi = {
  driveOAuthPocStatus(): Promise<{ enabled: boolean; serviceAccountEnabled: boolean }> {
    return api.get<{ enabled: boolean; serviceAccountEnabled: boolean }>('/estimations/drive/oauth-poc/status');
  },
  /** Comprueba la concesión efímera sin enviar tokens al navegador. */
  driveOAuthPocAccess(input: { projectId: string; driveFolderUrl?: string }): Promise<{ authorized: boolean }> {
    return api.get<{ authorized: boolean }>(
      '/estimations/drive/oauth-poc/access?' + new URLSearchParams({ projectId: input.projectId,
        ...(input.driveFolderUrl ? { driveFolderUrl: input.driveFolderUrl } : {}) }).toString(),
    );
  },
  /** PoC sin tokens ni credenciales devueltos al navegador. */
  startDriveOAuthPoc(input: { projectId: string; driveFolderUrl?: string }): Promise<DriveOAuthPocStart> {
    return api.post<DriveOAuthPocStart>('/estimations/drive/oauth-poc/start', input);
  },
  browseDriveFolder(input: {
    projectId: string; authorizationFolderUrl: string; folderUrl: string;
  }): Promise<DriveBrowseResult> {
    return api.post<DriveBrowseResult>('/estimations/drive/folders/browse', input);
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
  /** Una solicitud IA; actividad verificable y resúmenes del modelo independientes. */
  analyzePocStream(
    input: AnalyzeEstimationPocInput,
    onThoughtSummary: (text: string) => void,
    signal?: AbortSignal,
    onProgress?: (phase: string, text: string, at?: string) => void,
    onHeartbeat?: (seconds: number) => void,
  ): Promise<EstimationPocAnalysis> {
    return apiEventStream<EstimationPocAnalysis>(
      '/estimations/poc/analyze/stream', input,
      (event, payload) => {
        if (!payload || typeof payload !== 'object') return;
        const value = payload as { text?: unknown; phase?: unknown;
          at?: unknown; elapsedSeconds?: unknown };
        if (event === 'thought' && typeof value.text === 'string' &&
          value.text.trim()) onThoughtSummary(value.text);
        if (event === 'phase' && typeof value.phase === 'string' &&
          typeof value.text === 'string' && value.text.trim()) {
          onProgress?.(value.phase, value.text,
            typeof value.at === 'string' ? value.at : undefined);
        }
        if (event === 'heartbeat' && typeof value.elapsedSeconds === 'number') {
          onHeartbeat?.(value.elapsedSeconds);
        }
      }, signal,
    );
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
