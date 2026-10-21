export const DRIVE_FOLDER_CLIENT = Symbol('DRIVE_FOLDER_CLIENT');

export interface DriveFolderFile {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly modifiedAt: string;
  readonly webViewLink: string | null;
  readonly sizeBytes: number | null;
}

/**
 * Puerto mínimo de Drive usado por Calculadora.
 *
 * Por ahora solo enumera los archivos directos de una carpeta. La descarga y
 * exportación de contenido para IA queda en DocumentSourceReader.
 */
export interface DriveFolderClient {
  isConfigured(): boolean;
  listFiles(folderId: string): Promise<readonly DriveFolderFile[]>;
}
