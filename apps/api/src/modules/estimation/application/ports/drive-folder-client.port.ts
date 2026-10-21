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

/**
 * Boundary de metadata de Google Drive usado por Calculadora.
 *
 * - resuelve carpetas candidatas por metadata;
 * - recorre jerarquía;
 * - lista archivos para la UI.
 *
 * La descarga/exportación de contenido para IA permanece en
 * DocumentSourceReader.
 */
export interface DriveFolderClient {
  isConfigured(): boolean;
  listFiles(folderId: string): Promise<readonly DriveFolderFile[]>;
  listChildren(folderId: string): Promise<readonly DriveFolderItem[]>;
  searchFolders(terms: readonly string[]): Promise<readonly DriveFolderItem[]>;
  getMetadata(fileId: string): Promise<DriveFolderMetadata | null>;
}
