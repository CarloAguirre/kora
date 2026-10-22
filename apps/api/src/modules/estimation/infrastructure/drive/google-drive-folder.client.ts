import { createSign } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../../config/app-config.service';
import type {
  DriveFolderClient,
  DriveFolderFile,
  DriveFolderItem,
  DriveFolderMetadata,
  DriveAnalysisContent,
} from '../../application/ports/drive-folder-client.port';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const FILE_FIELDS =
  'id,name,mimeType,modifiedTime,webViewLink,size,parents';

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
}

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
 * Adaptador server-to-server para Google Drive mediante cuenta de servicio.
 *
 * La carpeta debe estar compartida con GOOGLE_DRIVE_CLIENT_EMAIL. No reutiliza
 * el OAuth de login: ese flujo solo pide openid/email/profile y no conserva
 * tokens de Drive.
 */
@Injectable()
export class GoogleDriveFolderClient implements DriveFolderClient {
  private cachedToken: { value: string; expiresAtMs: number } | null = null;

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    return this.config.googleDrive.enabled;
  }

  async listFiles(folderId: string): Promise<readonly DriveFolderFile[]> {
    const children = await this.listChildren(folderId);
    return children.filter(
      (item): item is DriveFolderFile => item.itemType === 'file',
    );
  }

  async listChildren(folderId: string): Promise<readonly DriveFolderItem[]> {
    return this.listByQuery(
      `'${escapeDriveQueryValue(folderId)}' in parents and trashed = false`,
      100,
      'modifiedTime desc',
    );
  }

  async searchFolders(
    terms: readonly string[],
  ): Promise<readonly DriveFolderItem[]> {
    const cleanedTerms = [...new Set(terms.map((term) => term.trim()).filter(Boolean))]
      .slice(0, 4);

    if (cleanedTerms.length === 0) return [];

    const nameFilter = cleanedTerms
      .map((term) => `name contains '${escapeDriveQueryValue(term)}'`)
      .join(' or ');

    return this.listByQuery(
      `mimeType = '${DRIVE_FOLDER_MIME}' and trashed = false and (${nameFilter})`,
      100,
      'modifiedTime desc',
    );
  }

  async readAnalysisContent(
    fileId: string,
    mimeType: string,
  ): Promise<DriveAnalysisContent | null> {
    this.assertConfigured();

    const exportMimeType = googleExportMimeType(mimeType);
    if (exportMimeType) {
      const response = await this.authorizedFetch(
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

  async getMetadata(fileId: string): Promise<DriveFolderMetadata | null> {
    this.assertConfigured();
    const accessToken = await this.getAccessToken();
    const url = new URL(
      `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}`,
    );
    url.searchParams.set('fields', FILE_FIELDS);
    url.searchParams.set('supportsAllDrives', 'true');

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

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
    query: string,
    pageSize: number,
    orderBy?: string,
  ): Promise<readonly DriveFolderItem[]> {
    this.assertConfigured();
    const accessToken = await this.getAccessToken();
    const url = new URL(DRIVE_FILES_ENDPOINT);
    url.searchParams.set('q', query);
    url.searchParams.set('fields', `files(${FILE_FIELDS})`);
    url.searchParams.set('pageSize', String(pageSize));
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('includeItemsFromAllDrives', 'true');
    if (orderBy) url.searchParams.set('orderBy', orderBy);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw driveError(response.status);
    }

    const body = (await response.json()) as GoogleDriveListResponse;
    return (body.files ?? [])
      .filter(isUsableDriveFile)
      .map(toDriveFolderItem);
  }

  private async authorizedFetch(url: string): Promise<Response> {
    const accessToken = await this.getAccessToken();
    return fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error('La integración de Google Drive no está configurada.');
    }
  }

  private async getAccessToken(): Promise<string> {
    const nowMs = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAtMs > nowMs + 60_000) {
      return this.cachedToken.value;
    }

    const { clientEmail, privateKey } = this.config.googleDrive;
    const now = Math.floor(nowMs / 1000);
    const unsignedToken = [
      encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
      encodeBase64Url(
        JSON.stringify({
          iss: clientEmail,
          scope: DRIVE_READONLY_SCOPE,
          aud: TOKEN_ENDPOINT,
          iat: now,
          exp: now + 3600,
        }),
      ),
    ].join('.');

    const signature = createSign('RSA-SHA256')
      .update(unsignedToken)
      .end()
      .sign(privateKey)
      .toString('base64url');

    const assertion = `${unsignedToken}.${signature}`;
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Google rechazó las credenciales de Drive (HTTP ${response.status}).`,
      );
    }

    const body = (await response.json()) as GoogleTokenResponse;
    if (!body.access_token) {
      throw new Error('Google no devolvió access_token para Drive.');
    }

    const ttlSeconds = body.expires_in ?? 3600;
    this.cachedToken = {
      value: body.access_token,
      expiresAtMs: nowMs + ttlSeconds * 1000,
    };
    return body.access_token;
  }
}

function isUsableDriveFile(
  file: GoogleDriveFileResponse,
): file is Required<
  Pick<GoogleDriveFileResponse, 'id' | 'name' | 'mimeType' | 'modifiedTime'>
> &
  GoogleDriveFileResponse {
  return Boolean(file.id && file.name && file.mimeType && file.modifiedTime);
}

function toDriveFolderItem(
  file: Required<
    Pick<GoogleDriveFileResponse, 'id' | 'name' | 'mimeType' | 'modifiedTime'>
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
    itemType: file.mimeType === DRIVE_FOLDER_MIME ? 'folder' : 'file',
    parentIds: file.parents ?? [],
  };
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function driveError(status: number): Error {
  return new Error(
    status === 403
      ? 'Kora no tiene permiso para consultar este recurso de Drive.'
      : `Google Drive rechazó la consulta (HTTP ${status}).`,
  );
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
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
