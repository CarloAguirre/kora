import { Inject, Injectable } from '@nestjs/common';
import {
  estimationDriveInventorySchema,
  type EstimationDriveFileKind,
  type EstimationDriveInventory,
  type EstimationDriveInventoryItem,
  type EstimationDriveSourcePriority,
  type InventoryEstimationDriveInput,
} from '@kora/contracts';
import {
  DRIVE_FOLDER_CLIENT,
  type DriveFolderClient,
  type DriveFolderItem,
} from '../ports/drive-folder-client.port';

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
      return emptyInventory(
        'not_configured',
        rootFolderId,
        input.driveFolderUrl,
        'Google Drive aún no está configurado en la API de Kora.',
      );
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
          const classification = classifySource(child, path);

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

function classifySource(
  item: DriveFolderItem,
  path: string,
): { priority: EstimationDriveSourcePriority; reason: string | null } {
  const value = normalize(`${path} ${item.name}`);

  if (
    /(password|contrasena|secret|credencial|credential|private key|api key)/.test(value) ||
    /(^|\s)acceso(s)?(\s|$)/.test(value) ||
    item.mimeType === 'application/vnd.android.package-archive'
  ) {
    return {
      priority: 'excluded',
      reason: 'Se excluye por seguridad o por no aportar contenido documental al análisis.',
    };
  }

  if (
    /(antiguo|backup|respaldo|deprecated|historico obsoleto)/.test(value)
  ) {
    return {
      priority: 'excluded',
      reason: 'Se excluye por defecto por corresponder a respaldo o material antiguo.',
    };
  }

  if (
    /(levantamiento|requerimiento|especificacion|arquitectura|as is|to be|flujo|proceso|caso de uso|historia de usuario|kick ?off|matriz funcional|documentacion por modulos)/.test(
      value,
    )
  ) {
    return {
      priority: 'recommended',
      reason: 'El nombre/ruta indica un antecedente de alto valor para estimación.',
    };
  }

  return {
    priority: 'secondary',
    reason: null,
  };
}

function classifyDriveKind(mimeType: string): EstimationDriveFileKind {
  if (
    mimeType === 'application/vnd.google-apps.document' ||
    mimeType.includes('wordprocessingml') ||
    mimeType === 'application/msword' ||
    mimeType === 'text/plain' ||
    mimeType === 'text/markdown'
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

function extractDriveFolderId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.hostname !== 'drive.google.com') return null;
    const match = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (match?.[1]) return match[1];
    const id = url.searchParams.get('id');
    return id && /^[a-zA-Z0-9_-]+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
