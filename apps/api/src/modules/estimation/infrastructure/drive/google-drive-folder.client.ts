import { createSign } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../../config/app-config.service';
import type {
  DriveFolderClient,
  DriveFolderFile,
} from '../../application/ports/drive-folder-client.port';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

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
    if (!this.isConfigured()) {
      throw new Error('La integración de Google Drive no está configurada.');
    }

    const accessToken = await this.getAccessToken();
    const url = new URL(DRIVE_FILES_ENDPOINT);
    url.searchParams.set(
      'q',
      `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
    );
    url.searchParams.set(
      'fields',
      'files(id,name,mimeType,modifiedTime,webViewLink,size)',
    );
    url.searchParams.set('orderBy', 'modifiedTime desc');
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('includeItemsFromAllDrives', 'true');

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(
        response.status === 403
          ? 'Kora no tiene permiso para leer esta carpeta de Drive.'
          : `Google Drive rechazó la consulta (HTTP ${response.status}).`,
      );
    }

    const body = (await response.json()) as GoogleDriveListResponse;

    return (body.files ?? [])
      .filter(
        (file): file is Required<
          Pick<GoogleDriveFileResponse, 'id' | 'name' | 'mimeType' | 'modifiedTime'>
        > &
          GoogleDriveFileResponse =>
          Boolean(file.id && file.name && file.mimeType && file.modifiedTime),
      )
      .map((file) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        modifiedAt: file.modifiedTime,
        webViewLink: file.webViewLink ?? null,
        sizeBytes: file.size ? Number(file.size) : null,
      }));
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

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}
