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
 * Toda operación recibe explícitamente el userId autenticado. El adaptador
 * obtiene un token OAuth delegado para ESE usuario, por lo que Google aplica
 * directamente sus permisos reales sobre carpetas y archivos.
 */
export interface DriveFolderClient {
  isConnected(userId: string): Promise<boolean>;
  listFiles(
    userId: string,
    folderId: string,
  ): Promise<readonly DriveFolderFile[]>;
  listChildren(
    userId: string,
    folderId: string,
  ): Promise<readonly DriveFolderItem[]>;
  searchFolders(
    userId: string,
    terms: readonly string[],
  ): Promise<readonly DriveFolderItem[]>;
  getMetadata(
    userId: string,
    fileId: string,
  ): Promise<DriveFolderMetadata | null>;
  readAnalysisContent(
    userId: string,
    fileId: string,
    mimeType: string,
  ): Promise<DriveAnalysisContent | null>;
}
