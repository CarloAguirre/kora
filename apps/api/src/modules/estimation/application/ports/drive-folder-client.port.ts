export const DRIVE_FOLDER_CLIENT = Symbol('DRIVE_FOLDER_CLIENT');

export interface DriveFolderItem {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly modifiedAt: string;
  readonly webViewLink: string | null;
  readonly sizeBytes: number | null;
  readonly itemType: 'file' | 'folder';
  readonly parentIds: readonly string[];
}

export type DriveFolderFile = DriveFolderItem & {
  readonly itemType: 'file';
};

export interface DriveFolderMetadata {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly modifiedAt: string;
  readonly webViewLink: string | null;
  readonly parentIds: readonly string[];
}

export interface DriveAnalysisContent {
  readonly mimeType: string;
  readonly text?: string;
  readonly dataBase64?: string;
}

/**
 * Boundary de Google Drive usado por Calculadora.
 *
 * El adaptador resuelve metadata, jerarquía y lectura de formatos soportados.
 * La selección semántica de qué documentos analizar permanece en la capa de
 * aplicación.
 */
export interface DriveFolderClient {
  isConfigured(): boolean;
  listFiles(folderId: string): Promise<readonly DriveFolderFile[]>;
  listChildren(folderId: string): Promise<readonly DriveFolderItem[]>;
  searchFolders(terms: readonly string[]): Promise<readonly DriveFolderItem[]>;
  getMetadata(fileId: string): Promise<DriveFolderMetadata | null>;
  readAnalysisContent(
    fileId: string,
    mimeType: string,
  ): Promise<DriveAnalysisContent | null>;
}
