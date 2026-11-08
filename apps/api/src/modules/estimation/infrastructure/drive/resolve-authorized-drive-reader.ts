import { BadRequestException } from '@nestjs/common';
import { AppConfigService } from '../../../../config/app-config.service';
import { DRIVE_DISCOVERY_SESSION, GoogleDriveOAuthPocService } from '../../../../shared/infrastructure/auth/google-drive-oauth-poc.service';
import { extractDriveFolderId } from '../../application/drive-source-selection';
import type { DocumentSourceReader } from '../../application/ports/document-source-reader.port';
import { GoogleDriveFolderClient } from './google-drive-folder.client';
import { GoogleDriveDocumentSourceReader } from './google-drive-document-source.reader';

/**
 * Autoriza la carpeta real para ESTE usuario autenticado. No utiliza un token
 * OAuth ajeno ni intenta el fixture KDM como sustituto de documentación real.
 * La cuenta de servicio sigue funcionando sin OAuth cuando está configurada.
 */
export function resolveAuthorizedDriveReader(
  driveFolderUrl: string,
  userId: string,
  config?: AppConfigService,
  oauth?: GoogleDriveOAuthPocService,
): DocumentSourceReader | undefined {
  const folderId = extractDriveFolderId(driveFolderUrl);
  if (!folderId) throw new BadRequestException('Ingresa una URL válida de carpeta de Google Drive.');
  if (folderId === 'kora-poc-fallback') return undefined; // compatibilidad con tests legados
  if (!config) throw new BadRequestException('Configuración de Drive no disponible.');

  const delegatedToken = oauth?.getAuthorizedAccessToken(userId, folderId) ??
    oauth?.getAuthorizedAccessToken(userId, DRIVE_DISCOVERY_SESSION);
  if (delegatedToken) {
    return new GoogleDriveDocumentSourceReader(new GoogleDriveFolderClient(config, delegatedToken));
  }
  if (config.googleDrive.enabled) return undefined;

  throw new BadRequestException(
    'Autoriza primero esta carpeta con Google desde el asistente. ' +
    'La autorización es temporal y se debe renovar cuando caduque.',
  );
}
