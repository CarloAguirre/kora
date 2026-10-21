import { Inject, Injectable } from '@nestjs/common';
import {
  estimationDriveFolderListingSchema,
  type EstimationDriveFileKind,
  type EstimationDriveFolderListing,
  type ListEstimationDriveFilesInput,
} from '@kora/contracts';
import {
  DRIVE_FOLDER_CLIENT,
  type DriveFolderClient,
} from '../ports/drive-folder-client.port';

@Injectable()
export class ListEstimationDriveFilesUseCase {
  constructor(
    @Inject(DRIVE_FOLDER_CLIENT)
    private readonly drive: DriveFolderClient,
  ) {}

  async execute(
    input: ListEstimationDriveFilesInput,
  ): Promise<EstimationDriveFolderListing> {
    const folderId = extractDriveFolderId(input.driveFolderUrl);

    if (!folderId) {
      return estimationDriveFolderListingSchema.parse({
        folderId: 'invalid',
        folderUrl: input.driveFolderUrl,
        connection: 'unavailable',
        files: [],
        message: 'No se pudo identificar el ID de la carpeta de Google Drive.',
      });
    }

    if (!this.drive.isConfigured()) {
      return estimationDriveFolderListingSchema.parse({
        folderId,
        folderUrl: input.driveFolderUrl,
        connection: 'not_configured',
        files: [],
        message:
          'Google Drive aún no está configurado en la API de Kora. Define las credenciales de la cuenta de servicio para listar archivos.',
      });
    }

    try {
      const files = await this.drive.listFiles(folderId);

      return estimationDriveFolderListingSchema.parse({
        folderId,
        folderUrl: input.driveFolderUrl,
        connection: 'connected',
        files: files.map((file) => ({
          ...file,
          kind: classifyDriveFile(file.mimeType),
        })),
        message: null,
      });
    } catch (error) {
      return estimationDriveFolderListingSchema.parse({
        folderId,
        folderUrl: input.driveFolderUrl,
        connection: 'unavailable',
        files: [],
        message:
          error instanceof Error
            ? error.message
            : 'No se pudieron consultar los archivos de Google Drive.',
      });
    }
  }
}

function extractDriveFolderId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.hostname !== 'drive.google.com') return null;

    const folderMatch = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch?.[1]) return folderMatch[1];

    const id = url.searchParams.get('id');
    return id && /^[a-zA-Z0-9_-]+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function classifyDriveFile(mimeType: string): EstimationDriveFileKind {
  if (
    mimeType === 'application/vnd.google-apps.document' ||
    mimeType.includes('wordprocessingml') ||
    mimeType === 'application/msword'
  ) {
    return 'document';
  }

  if (
    mimeType === 'application/vnd.google-apps.spreadsheet' ||
    mimeType.includes('spreadsheetml') ||
    mimeType === 'application/vnd.ms-excel'
  ) {
    return 'spreadsheet';
  }

  if (
    mimeType === 'application/vnd.google-apps.presentation' ||
    mimeType.includes('presentationml') ||
    mimeType === 'application/vnd.ms-powerpoint'
  ) {
    return 'presentation';
  }

  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  return 'other';
}
