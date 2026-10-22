import { Inject, Injectable } from '@nestjs/common';
import {
  estimationDriveInventorySchema,
  type EstimationDriveInventory,
  type EstimationDriveInventoryItem,
  type InventoryEstimationDriveInput,
} from '@kora/contracts';
import {
  DRIVE_FOLDER_CLIENT,
  type DriveFolderClient,
} from '../ports/drive-folder-client.port';
import {
  canReadDriveSource,
  classifyDriveKind,
  classifyDriveSource,
  extractDriveFolderId,
} from '../drive-source-selection';
import {
  FALLBACK_DOCUMENT_ID,
  FALLBACK_DOCUMENT_MIME_TYPE,
  FALLBACK_DOCUMENT_MODIFIED_AT,
  FALLBACK_DOCUMENT_NAME,
  FALLBACK_DOCUMENT_PATH,
} from '../fallback-estimation-document';

const MAX_INVENTORY_ITEMS = 150;

@Injectable()
export class InventoryEstimationDriveUseCase {
  constructor(
    @Inject(DRIVE_FOLDER_CLIENT)
    private readonly drive: DriveFolderClient,
  ) {}

  async execute(
    input: InventoryEstimationDriveInput,
  ): Promise<EstimationDriveInventory> {
    const rootFolderId = extractDriveFolderId(input.driveFolderUrl);

    if (!rootFolderId) {
      return emptyInventory(
        'unavailable',
        'invalid',
        input.driveFolderUrl,
        'No se pudo identificar el ID de la carpeta de Google Drive.',
      );
    }

    if (!this.drive.isConfigured()) {
      return fallbackInventory(rootFolderId, input.driveFolderUrl);
    }

    try {
      const items: EstimationDriveInventoryItem[] = [];
      const queue: Array<{ folderId: string; path: string; depth: number }> = [
        { folderId: rootFolderId, path: '', depth: 1 },
      ];
      let truncated = false;

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) break;

        const children = await this.drive.listChildren(current.folderId);
        for (const child of children) {
          if (items.length >= MAX_INVENTORY_ITEMS) {
            truncated = true;
            break;
          }

          const path = current.path
            ? `${current.path}/${child.name}`
            : child.name;
          const classification = classifyDriveSource(child, path);

          items.push({
            id: child.id,
            name: child.name,
            url: child.webViewLink,
            mimeType: child.mimeType,
            itemType: child.itemType,
            kind:
              child.itemType === 'file'
                ? classifyDriveKind(child.mimeType)
                : null,
            modifiedAt: child.modifiedAt,
            path,
            depth: current.depth,
            priority: classification.priority,
            analyzable:
              child.itemType === 'file' &&
              classification.priority !== 'excluded' &&
              canReadDriveSource(child.mimeType),
            reason: classification.reason,
          });

          if (
            child.itemType === 'folder' &&
            current.depth < input.maxDepth &&
            classification.priority !== 'excluded'
          ) {
            queue.push({
              folderId: child.id,
              path,
              depth: current.depth + 1,
            });
          }
        }

        if (truncated) break;
      }

      const files = items.filter((item) => item.itemType === 'file').length;
      const folders = items.filter((item) => item.itemType === 'folder').length;

      return estimationDriveInventorySchema.parse({
        connection: 'connected',
        rootFolderId,
        rootFolderUrl: input.driveFolderUrl,
        summary: {
          files,
          folders,
          recommended: items.filter((item) => item.priority === 'recommended').length,
          secondary: items.filter((item) => item.priority === 'secondary').length,
          excluded: items.filter((item) => item.priority === 'excluded').length,
          truncated,
        },
        items,
        message: truncated
          ? `El inventario alcanzó el límite de ${MAX_INVENTORY_ITEMS} elementos.`
          : null,
      });
    } catch (error) {
      return emptyInventory(
        'unavailable',
        rootFolderId,
        input.driveFolderUrl,
        error instanceof Error
          ? error.message
          : 'No se pudo recorrer la carpeta de Google Drive.',
      );
    }
  }
}

function emptyInventory(
  connection: 'not_configured' | 'unavailable',
  rootFolderId: string,
  rootFolderUrl: string,
  message: string,
): EstimationDriveInventory {
  return estimationDriveInventorySchema.parse({
    connection,
    rootFolderId,
    rootFolderUrl,
    summary: {
      files: 0,
      folders: 0,
      recommended: 0,
      secondary: 0,
      excluded: 0,
      truncated: false,
    },
    items: [],
    message,
  });
}



function fallbackInventory(
  rootFolderId: string,
  rootFolderUrl: string,
): EstimationDriveInventory {
  return estimationDriveInventorySchema.parse({
    connection: 'connected',
    rootFolderId,
    rootFolderUrl,
    summary: {
      files: 1,
      folders: 0,
      recommended: 1,
      secondary: 0,
      excluded: 0,
      truncated: false,
    },
    items: [
      {
        id: FALLBACK_DOCUMENT_ID,
        name: FALLBACK_DOCUMENT_NAME,
        url: null,
        mimeType: FALLBACK_DOCUMENT_MIME_TYPE,
        itemType: 'file',
        kind: 'pdf',
        modifiedAt: FALLBACK_DOCUMENT_MODIFIED_AT,
        path: FALLBACK_DOCUMENT_PATH,
        depth: 1,
        priority: 'recommended',
        analyzable: true,
        reason:
          'Antecedente temporal de la PoC utilizado mientras Google Drive no está configurado.',
      },
    ],
    message:
      'Modo fallback PoC: este antecedente simula un archivo disponible en la carpeta Drive del prospecto.',
  });
}
