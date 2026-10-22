import { Injectable } from '@nestjs/common';
import { GoogleDriveAuthorizationService } from '../../../../shared/infrastructure/auth/google-drive-authorization.service';
import type {
  DriveAnalysisContent,
  DriveFolderClient,
  DriveFolderFile,
  DriveFolderItem,
  DriveFolderMetadata,
} from '../../application/ports/drive-folder-client.port';

const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
const FILE_FIELDS =
  'id,name,mimeType,modifiedTime,webViewLink,size,parents';

interface GoogleDriveFileResponse {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  webViewLink?: string;
  size?: string;
  parents?: string[];
}

interface GoogleDriveListResponse {
  files?: GoogleDriveFileResponse[];
}

/**
 * Adaptador Drive delegado.
 *
 * Cada operación recibe el userId autenticado y obtiene un access token
 * derivado del consentimiento OAuth de ese usuario. Kora no tiene una cuenta
 * global con acceso transversal a proyectos.
 */
@Injectable()
export class GoogleDriveFolderClient implements DriveFolderClient {
  constructor(
    private readonly authorization: GoogleDriveAuthorizationService,
  ) {}

  isConnected(userId: string): Promise<boolean> {
    return this.authorization.isConnected(userId);
  }

  async listFiles(
    userId: string,
    folderId: string,
  ): Promise<readonly DriveFolderFile[]> {
    const children = await this.listChildren(userId, folderId);
    return children.filter(
      (item): item is DriveFolderFile => item.itemType === 'file',
    );
  }

  async listChildren(
    userId: string,
    folderId: string,
  ): Promise<readonly DriveFolderItem[]> {
    return this.listByQuery(
      userId,
      `'${escapeDriveQueryValue(folderId)}' in parents and trashed = false`,
      100,
      'modifiedTime desc',
    );
  }

  async searchFolders(
    userId: string,
    terms: readonly string[],
  ): Promise<readonly DriveFolderItem[]> {
    const cleanedTerms = [
      ...new Set(terms.map((term) => term.trim()).filter(Boolean)),
    ].slice(0, 4);

    if (cleanedTerms.length === 0) return [];

    const nameFilter = cleanedTerms
      .map(
        (term) =>
          `name contains '${escapeDriveQueryValue(term)}'`,
      )
      .join(' or ');

    return this.listByQuery(
      userId,
      `mimeType = '${DRIVE_FOLDER_MIME}' and trashed = false and (${nameFilter})`,
      100,
      'modifiedTime desc',
    );
  }

  async readAnalysisContent(
    userId: string,
    fileId: string,
    mimeType: string,
  ): Promise<DriveAnalysisContent | null> {
    const exportMimeType = googleExportMimeType(mimeType);
    if (exportMimeType) {
      const response = await this.authorizedFetch(
        userId,
        `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMimeType)}`,
      );
      if (!response.ok) throw driveError(response.status);

      if (exportMimeType === 'application/pdf') {
        const bytes = Buffer.from(await response.arrayBuffer());
        return {
          mimeType: exportMimeType,
          dataBase64: bytes.toString('base64'),
        };
      }

      return {
        mimeType: exportMimeType,
        text: await response.text(),
      };
    }

    if (mimeType === 'application/pdf') {
      const response = await this.authorizedFetch(
        userId,
        `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      );
      if (!response.ok) throw driveError(response.status);

      const bytes = Buffer.from(await response.arrayBuffer());
      return {
        mimeType,
        dataBase64: bytes.toString('base64'),
      };
    }

    if (isPlainTextMime(mimeType)) {
      const response = await this.authorizedFetch(
        userId,
        `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      );
      if (!response.ok) throw driveError(response.status);

      return {
        mimeType,
        text: await response.text(),
      };
    }

    return null;
  }

  async getMetadata(
    userId: string,
    fileId: string,
  ): Promise<DriveFolderMetadata | null> {
    const url = new URL(
      `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}`,
    );
    url.searchParams.set('fields', FILE_FIELDS);
    url.searchParams.set('supportsAllDrives', 'true');

    const response = await this.authorizedFetch(
      userId,
      url.toString(),
    );

    if (response.status === 404) return null;
    if (!response.ok) {
      throw driveError(response.status);
    }

    const file = (await response.json()) as GoogleDriveFileResponse;
    if (!isUsableDriveFile(file)) return null;

    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedAt: file.modifiedTime,
      webViewLink: file.webViewLink ?? null,
      parentIds: file.parents ?? [],
    };
  }

  private async listByQuery(
    userId: string,
    query: string,
    pageSize: number,
    orderBy?: string,
  ): Promise<readonly DriveFolderItem[]> {
    const url = new URL(DRIVE_FILES_ENDPOINT);
    url.searchParams.set('q', query);
    url.searchParams.set('fields', `files(${FILE_FIELDS})`);
    url.searchParams.set('pageSize', String(pageSize));
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('includeItemsFromAllDrives', 'true');
    if (orderBy) url.searchParams.set('orderBy', orderBy);

    const response = await this.authorizedFetch(
      userId,
      url.toString(),
    );

    if (!response.ok) {
      throw driveError(response.status);
    }

    const body = (await response.json()) as GoogleDriveListResponse;
    return (body.files ?? [])
      .filter(isUsableDriveFile)
      .map(toDriveFolderItem);
  }

  private async authorizedFetch(
    userId: string,
    url: string,
  ): Promise<Response> {
    const accessToken =
      await this.authorization.getAccessToken(userId);

    return fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
}

function isUsableDriveFile(
  file: GoogleDriveFileResponse,
): file is Required<
  Pick<
    GoogleDriveFileResponse,
    'id' | 'name' | 'mimeType' | 'modifiedTime'
  >
> &
  GoogleDriveFileResponse {
  return Boolean(
    file.id && file.name && file.mimeType && file.modifiedTime,
  );
}

function toDriveFolderItem(
  file: Required<
    Pick<
      GoogleDriveFileResponse,
      'id' | 'name' | 'mimeType' | 'modifiedTime'
    >
  > &
    GoogleDriveFileResponse,
): DriveFolderItem {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedAt: file.modifiedTime,
    webViewLink: file.webViewLink ?? null,
    sizeBytes: file.size ? Number(file.size) : null,
    itemType:
      file.mimeType === DRIVE_FOLDER_MIME ? 'folder' : 'file',
    parentIds: file.parents ?? [],
  };
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function driveError(status: number): Error {
  if (status === 401) {
    return new Error(
      'La autorización de Google Drive expiró o fue revocada. Vuelve a conectar Drive.',
    );
  }

  if (status === 403 || status === 404) {
    return new Error(
      'Tu cuenta Google no tiene permiso para consultar este recurso de Drive.',
    );
  }

  return new Error(
    `Google Drive rechazó la consulta (HTTP ${status}).`,
  );
}

function googleExportMimeType(mimeType: string): string | null {
  switch (mimeType) {
    case 'application/vnd.google-apps.document':
      return 'text/plain';
    case 'application/vnd.google-apps.spreadsheet':
      return 'text/csv';
    case 'application/vnd.google-apps.presentation':
      return 'application/pdf';
    default:
      return null;
  }
}

function isPlainTextMime(mimeType: string): boolean {
  return new Set([
    'text/plain',
    'text/markdown',
    'text/csv',
    'text/tab-separated-values',
    'text/html',
    'text/xml',
    'text/rtf',
    'application/json',
  ]).has(mimeType);
}
