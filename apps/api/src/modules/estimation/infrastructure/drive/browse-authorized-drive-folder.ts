import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { AppConfigService } from '../../../../config/app-config.service';
import { DRIVE_DISCOVERY_SESSION, GoogleDriveOAuthPocService } from '../../../../shared/infrastructure/auth/google-drive-oauth-poc.service';
import { extractDriveFolderId } from '../../application/drive-source-selection';
import { readEstimationDocuments, type DocumentSourceCoverage } from '../../application/ports/document-source-reader.port';
import type { DriveFolderClient, DriveFolderItem, DriveFolderMetadata } from '../../application/ports/drive-folder-client.port';
import { GoogleDriveFolderClient } from './google-drive-folder.client';
import { GoogleDriveDocumentSourceReader } from './google-drive-document-source.reader';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MAX_ANCESTOR_DEPTH = 10;
const folderUrl = (id: string): string => `https://drive.google.com/drive/folders/${id}`;

export const browseDriveFolderInputSchema = z.object({
  projectId: z.uuid(),
  authorizationFolderUrl: z.url().max(2048),
  folderUrl: z.url().max(2048),
});
export type BrowseDriveFolderInput = z.infer<typeof browseDriveFolderInputSchema>;

export interface BrowseDriveFolderResult {
  folder: DriveBrowseFolder;
  parentFolder: DriveBrowseFolder | null;
  siblingFolders: DriveBrowseFolder[];
  childFolders: DriveBrowseFolder[];
  documents: Array<{
    id: string; name: string; path: string; mimeType: string; modifiedAt: string | null;
  }>;
  coverage: DocumentSourceCoverage | null;
  siblingsUnavailable: boolean;
}
interface DriveBrowseFolder { id: string; name: string; url: string; modifiedAt: string | null }

function asFolder(value: DriveFolderMetadata | DriveFolderItem): DriveBrowseFolder {
  return { id: value.id, name: value.name, url: folderUrl(value.id),
    modifiedAt: value.modifiedAt ?? null };
}
function isFolder(value: DriveFolderMetadata | null): value is DriveFolderMetadata {
  return value?.mimeType === FOLDER_MIME;
}

/**
 * Navega una carpeta raíz, sus hermanas y sus descendientes, validando jerarquía.
 * La identidad corporativa tiene prioridad; la PoC conserva OAuth como fallback.
 * No se permite consultar un ID arbitrario de Drive como "hermano".
 */
export async function browseAuthorizedDriveFolder(
  input: BrowseDriveFolderInput,
  actorId: string,
  config: AppConfigService,
  oauth: GoogleDriveOAuthPocService,
  driveOverride?: DriveFolderClient,
): Promise<BrowseDriveFolderResult> {
  const originalId = extractDriveFolderId(input.authorizationFolderUrl);
  const selectedId = extractDriveFolderId(input.folderUrl);
  if (!originalId || !selectedId || originalId === 'kora-poc-fallback' ||
      selectedId === 'kora-poc-fallback') {
    throw new BadRequestException('Selecciona una carpeta real de Google Drive.');
  }
  // En modo corporativo siempre se consulta Drive con la cuenta de servicio.
  // OAuth del usuario se reserva para la PoC cuando NO hay identidad técnica.
  const useServiceAccount = config.googleDrive.enabled;
  const folderToken = useServiceAccount ? null : oauth.getAuthorizedAccessToken(actorId, originalId);
  const delegatedToken = useServiceAccount ? null : folderToken ??
    oauth.getAuthorizedAccessToken(actorId, DRIVE_DISCOVERY_SESSION);
  if (!useServiceAccount && !delegatedToken) {
    throw new BadRequestException('Autoriza Google Drive antes de explorar carpetas.');
  }
  const drive = driveOverride ?? new GoogleDriveFolderClient(config, delegatedToken ?? undefined);
  const original = await drive.getMetadata(originalId);
  const selected = selectedId === originalId ? original : await drive.getMetadata(selectedId);
  if (!isFolder(original) || !isFolder(selected)) {
    throw new BadRequestException('La carpeta no existe o no es accesible con esta cuenta Google.');
  }

  // Google Drive puede no entregar un padre en unidades compartidas o raíces.
  // Si está presente, la selección debe pertenecer al subárbol de ese padre.
  const allowedAncestorId = original.parentIds[0] ?? originalId;
  // El padre sirve para comprobar hermandad, pero no es una carpeta seleccionable:
  // permitirlo expondría los hermanos del propio padre en el siguiente listado.
  if (selectedId !== originalId && selectedId === allowedAncestorId) {
    throw new BadRequestException('Selecciona una carpeta de este grupo, no su carpeta superior.');
  }
  if (selectedId !== originalId) {
    let cursor: DriveFolderMetadata | null = selected;
    const visited = new Set<string>();
    let allowed = false;
    for (let i = 0; cursor && i < MAX_ANCESTOR_DEPTH; i++) {
      if (cursor.id === allowedAncestorId || cursor.id === originalId) {
        allowed = true;
        break;
      }
      if (visited.has(cursor.id)) break;
      visited.add(cursor.id);
      const parentId: string | undefined = cursor.parentIds[0];
      if (!parentId) break;
      cursor = await drive.getMetadata(parentId);
    }
    if (!allowed) {
      throw new BadRequestException('La carpeta seleccionada no pertenece al grupo de carpetas autorizado. Introduce un enlace de carpeta accesible para Kora.');
    }
  }

  let parentFolder: DriveBrowseFolder | null = null;
  let siblingFolders: DriveBrowseFolder[] = [];
  let siblingsUnavailable = false;
  const parentId = selected.parentIds[0];
  if (parentId) {
    try {
      const parent = await drive.getMetadata(parentId);
      if (isFolder(parent)) {
        parentFolder = asFolder(parent);
        siblingFolders = (await drive.listChildren(parentId))
          .filter((item) => item.itemType === 'folder')
          .map(asFolder);
      }
    } catch {
      siblingsUnavailable = true; // La carpeta raíz todavía puede ser legible.
    }
  }
  const childFolders = (await drive.listChildren(selectedId))
    .filter((item) => item.itemType === 'folder').map(asFolder);

  // La misma selección documental, guardas y cobertura que usa /poc/analyze.
  // El frontend solo recibe metadatos: jamás contenido ni tokens OAuth.
  const read = await readEstimationDocuments(
    new GoogleDriveDocumentSourceReader(drive), folderUrl(selectedId),
  );

  // Solo en modo OAuth delegado: autorizar una carpeta relacionada después
  // de validar su jerarquía. En modo corporativo no hay token personal.
  if (delegatedToken && selectedId !== originalId) {
    oauth.authorizeRelatedFolder(actorId,
      folderToken ? originalId : DRIVE_DISCOVERY_SESSION, selectedId);
  }

  return {
    folder: asFolder(selected),
    parentFolder, siblingFolders, childFolders,
    documents: read.documents.map((doc) => ({
      id: doc.sourceId, name: doc.name, path: doc.path,
      mimeType: doc.mimeType, modifiedAt: doc.modifiedAt?.toISOString() ?? null,
    })),
    coverage: read.coverage,
    siblingsUnavailable,
  };
}
