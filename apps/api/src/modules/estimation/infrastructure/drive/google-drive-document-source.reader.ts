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
import {
  FALLBACK_DOCUMENT_ID,
  FALLBACK_DOCUMENT_MIME_TYPE,
  FALLBACK_DOCUMENT_MODIFIED_AT,
  FALLBACK_DOCUMENT_NAME,
  FALLBACK_DOCUMENT_PATH,
  FALLBACK_DOCUMENT_TEXT,
} from '../../application/fallback-estimation-document';

const MAX_DEPTH = 3;
const MAX_SOURCE_DOCUMENTS = 4;
const MAX_BINARY_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS_PER_DOCUMENT = 30_000;
const MAX_SCANNED_ITEMS = 150;
const MAX_BASE64_CHARS = Math.ceil((MAX_BINARY_BYTES * 4) / 3) + 4;

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
      return [
        {
          sourceId: FALLBACK_DOCUMENT_ID,
          name: FALLBACK_DOCUMENT_NAME,
          mimeType: FALLBACK_DOCUMENT_MIME_TYPE,
          path: FALLBACK_DOCUMENT_PATH,
          modifiedAt: new Date(FALLBACK_DOCUMENT_MODIFIED_AT),
          text: FALLBACK_DOCUMENT_TEXT,
        },
      ];
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
        if (
          content.dataBase64 &&
          content.dataBase64.length > MAX_BASE64_CHARS
        ) {
          continue;
        }

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
    let scannedItems = 0;

    while (
      queue.length > 0 &&
      candidates.length < 30 &&
      scannedItems < MAX_SCANNED_ITEMS
    ) {
      const current = queue.shift();
      if (!current) break;

      const children = await this.drive.listChildren(current.folderId);
      for (const child of children) {
        scannedItems += 1;
        if (scannedItems > MAX_SCANNED_ITEMS) break;
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
