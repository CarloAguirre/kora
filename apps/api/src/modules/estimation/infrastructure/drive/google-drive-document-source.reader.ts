import { Inject, Injectable } from '@nestjs/common';
import type {
  DocumentSourceReader,
  ProjectSourceDocument,
} from '../../application/ports/document-source-reader.port';
import {
  DRIVE_FOLDER_CLIENT,
  type DriveFolderClient,
  type DriveFolderItem,
} from '../../application/ports/drive-folder-client.port';
import {
  canReadDriveSource,
  classifyDriveSource,
  extractDriveFolderId,
} from '../../application/drive-source-selection';

const MAX_DEPTH = 3;
const MAX_SOURCE_DOCUMENTS = 6;
const MAX_BINARY_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS_PER_DOCUMENT = 40_000;

interface Candidate {
  readonly item: DriveFolderItem;
  readonly path: string;
  readonly rank: number;
}

@Injectable()
export class GoogleDriveDocumentSourceReader
  implements DocumentSourceReader
{
  constructor(
    @Inject(DRIVE_FOLDER_CLIENT)
    private readonly drive: DriveFolderClient,
  ) {}

  async readDriveSources(
    driveFolderUrl: string,
  ): Promise<readonly ProjectSourceDocument[]> {
    const rootFolderId = extractDriveFolderId(driveFolderUrl);
    if (!rootFolderId) {
      throw new Error('No se pudo identificar la carpeta raíz de Google Drive.');
    }
    if (!this.drive.isConfigured()) {
      throw new Error(
        'Google Drive no está configurado en la API de Kora.',
      );
    }

    const candidates = await this.collectCandidates(rootFolderId);
    const selected = candidates
      .sort((left, right) => left.rank - right.rank)
      .slice(0, MAX_SOURCE_DOCUMENTS);

    const documents: ProjectSourceDocument[] = [];

    for (const candidate of selected) {
      try {
        const content = await this.drive.readAnalysisContent(
          candidate.item.id,
          candidate.item.mimeType,
        );
        if (!content) continue;

        const text = content.text
          ? content.text.slice(0, MAX_TEXT_CHARS_PER_DOCUMENT).trim()
          : undefined;

        if (!text && !content.dataBase64) continue;

        documents.push({
          sourceId: candidate.item.id,
          name: candidate.item.name,
          mimeType: content.mimeType,
          path: candidate.path,
          modifiedAt: new Date(candidate.item.modifiedAt),
          ...(text ? { text } : {}),
          ...(content.dataBase64
            ? { dataBase64: content.dataBase64 }
            : {}),
        });
      } catch {
        // Un antecedente ilegible no debe abortar toda la estimación. La PoC
        // continúa con los demás documentos seleccionados.
      }
    }

    return documents;
  }

  private async collectCandidates(
    rootFolderId: string,
  ): Promise<Candidate[]> {
    const queue: Array<{ folderId: string; path: string; depth: number }> = [
      { folderId: rootFolderId, path: '', depth: 1 },
    ];
    const candidates: Candidate[] = [];

    while (queue.length > 0 && candidates.length < 30) {
      const current = queue.shift();
      if (!current) break;

      const children = await this.drive.listChildren(current.folderId);
      for (const child of children) {
        const path = current.path
          ? `${current.path}/${child.name}`
          : child.name;
        const classification = classifyDriveSource(child, path);

        if (classification.priority === 'excluded') continue;

        if (
          child.itemType === 'folder' &&
          current.depth < MAX_DEPTH
        ) {
          queue.push({
            folderId: child.id,
            path,
            depth: current.depth + 1,
          });
          continue;
        }

        if (
          child.itemType !== 'file' ||
          !canReadDriveSource(child.mimeType) ||
          (child.sizeBytes !== null &&
            child.sizeBytes > MAX_BINARY_BYTES)
        ) {
          continue;
        }

        candidates.push({
          item: child,
          path,
          rank: classification.priority === 'recommended' ? 0 : 1,
        });
      }
    }

    return candidates;
  }
}
