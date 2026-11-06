import { Inject, Injectable } from '@nestjs/common';
import type {
  DocumentSourceReader,
  DocumentSourceReadResult,
  DocumentCoverageOmission,
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
  normalizeDriveLabel,
} from '../../application/drive-source-selection';
import {
  FALLBACK_DOCUMENT_ID,
  FALLBACK_DOCUMENT_MIME_TYPE,
  FALLBACK_DOCUMENT_MODIFIED_AT,
  FALLBACK_DOCUMENT_NAME,
  FALLBACK_DOCUMENT_PATH,
  FALLBACK_DOCUMENT_TEXT,
} from '../../application/fallback-estimation-document';

/**
 * No existe un límite arbitrario de 4 archivos: se prioriza cobertura y
 * se consumen documentos completos mientras quepan en el presupuesto de
 * contexto y de tamaño de solicitud. Los límites siguen siendo guardas
 * operativas explícitas, no un indicio de que el alcance esté completo.
 */
const MAX_DEPTH = 4;
const MAX_SCANNED_ITEMS = 250;
const MAX_SOURCE_DOCUMENTS = 18;
const MAX_BINARY_BYTES_PER_DOCUMENT = 5 * 1024 * 1024;
const MAX_TOTAL_BINARY_BASE64_CHARS = Math.ceil((8 * 1024 * 1024 * 4) / 3) + 4;
const MAX_TEXT_CHARS_PER_DOCUMENT = 150_000;
const MAX_TOTAL_TEXT_CHARS = 360_000;
const MAX_BASE64_CHARS_PER_DOCUMENT =
  Math.ceil((MAX_BINARY_BYTES_PER_DOCUMENT * 4) / 3) + 4;

type Topic = 'requirements' | 'stories' | 'rules' | 'integrations' |
  'prototype' | 'architecture' | 'planning' | 'other';

const TOPICS: readonly Topic[] = [
  'requirements', 'stories', 'rules', 'integrations', 'prototype',
  'architecture', 'planning', 'other',
];

interface Candidate {
  readonly item: DriveFolderItem;
  readonly path: string;
  readonly rank: number;
  readonly topic: Topic;
}

interface CandidateCollection {
  readonly candidates: Candidate[];
  readonly omissions: DocumentCoverageOmission[];
  readonly scannedItems: number;
  readonly scanTruncated: boolean;
}

function topicFor(path: string): Topic {
  const normalized = normalizeDriveLabel(path);
  if (/(requerimiento|especificacion|levantamiento|\bers\b|alcance|rf\d)/.test(normalized)) {
    return 'requirements';
  }
  if (/(historia de usuario|caso de uso|\bhu\b|\bhdu\b|flujo|proceso|journey)/.test(normalized)) {
    return 'stories';
  }
  if (/(regla|matriz|validacion|aprobacion|permiso|perfil|rol de usuario)/.test(normalized)) {
    return 'rules';
  }
  if (/(integracion|\bapi\b|interfaz|\bsap\b|fiori|webhook)/.test(normalized)) {
    return 'integrations';
  }
  if (/(prototipo|maqueta|figma|pantalla|wireframe|ux|diseno visual)/.test(normalized)) {
    return 'prototype';
  }
  if (/(arquitectura|infraestructura|modelo de datos|diseno tecnico)/.test(normalized)) {
    return 'architecture';
  }
  if (/(roadmap|planificacion|cronograma|presupuesto|estimacion)/.test(normalized)) {
    return 'planning';
  }
  return 'other';
}

/** Una vuelta por cada categoría antes de tomar el siguiente archivo similar. */
function prioritizeCandidates(candidates: readonly Candidate[]): Candidate[] {
  const ordered: Candidate[] = [];
  for (const rank of [0, 1]) {
    const grouped = new Map<Topic, Candidate[]>();
    for (const topic of TOPICS) grouped.set(topic, []);
    for (const item of candidates) {
      if (item.rank === rank) grouped.get(item.topic)!.push(item);
    }
    for (const group of grouped.values()) {
      group.sort((a, b) => a.path.localeCompare(b.path, 'es') ||
        a.item.id.localeCompare(b.item.id));
    }
    while ([...grouped.values()].some((group) => group.length > 0)) {
      for (const topic of TOPICS) {
        const candidate = grouped.get(topic)!.shift();
        if (candidate) ordered.push(candidate);
      }
    }
  }
  return ordered;
}

@Injectable()
export class GoogleDriveDocumentSourceReader implements DocumentSourceReader {
  constructor(
    @Inject(DRIVE_FOLDER_CLIENT)
    private readonly drive: DriveFolderClient,
  ) {}

  async readDriveSources(
    driveFolderUrl: string,
  ): Promise<readonly ProjectSourceDocument[]> {
    return (await this.readDriveSourcesWithCoverage(driveFolderUrl)).documents;
  }

  async readDriveSourcesWithCoverage(
    driveFolderUrl: string,
  ): Promise<DocumentSourceReadResult> {
    const rootFolderId = extractDriveFolderId(driveFolderUrl);
    if (!rootFolderId) {
      throw new Error('No se pudo identificar la carpeta raíz de Google Drive.');
    }
    if (rootFolderId === 'kora-poc-fallback') {
      return {
        documents: [{
          sourceId: FALLBACK_DOCUMENT_ID,
          name: FALLBACK_DOCUMENT_NAME,
          mimeType: FALLBACK_DOCUMENT_MIME_TYPE,
          path: FALLBACK_DOCUMENT_PATH,
          modifiedAt: new Date(FALLBACK_DOCUMENT_MODIFIED_AT),
          text: FALLBACK_DOCUMENT_TEXT,
        }],
        coverage: null,
      };
    }
    if (!this.drive.isConfigured()) {
      throw new Error(
        'Google Drive no está configurado. No se puede leer la documentación del proyecto ni usar un ejemplo ajeno como evidencia.',
      );
    }

    const collection = await this.collectCandidates(rootFolderId);
    const documents: ProjectSourceDocument[] = [];
    const omitted = [...collection.omissions];
    let usedTextChars = 0;
    let usedBase64Chars = 0;

    for (const candidate of prioritizeCandidates(collection.candidates)) {
      if (documents.length >= MAX_SOURCE_DOCUMENTS) {
        omitted.push({
          path: candidate.path,
          reason: 'límite operativo de ' + MAX_SOURCE_DOCUMENTS + ' archivos',
        });
        continue;
      }
      try {
        const content = await this.drive.readAnalysisContent(
          candidate.item.id, candidate.item.mimeType,
        );
        if (!content) {
          omitted.push({ path: candidate.path, reason: 'contenido no legible' });
          continue;
        }

        const text = content.text?.trim();
        if (text) {
          if (text.length > MAX_TEXT_CHARS_PER_DOCUMENT) {
            omitted.push({
              path: candidate.path,
              reason: 'texto supera ' + MAX_TEXT_CHARS_PER_DOCUMENT +
                ' caracteres por documento (no se recorta silenciosamente)',
            });
            continue;
          }
          if (usedTextChars + text.length > MAX_TOTAL_TEXT_CHARS) {
            omitted.push({ path: candidate.path, reason: 'presupuesto total de texto agotado' });
            continue;
          }
          usedTextChars += text.length;
          documents.push({
            sourceId: candidate.item.id,
            name: candidate.item.name,
            mimeType: content.mimeType,
            path: candidate.path,
            modifiedAt: new Date(candidate.item.modifiedAt),
            text,
          });
          continue;
        }

        const binary = content.dataBase64;
        if (binary) {
          if (binary.length > MAX_BASE64_CHARS_PER_DOCUMENT) {
            omitted.push({ path: candidate.path, reason: 'archivo binario supera 5 MB' });
            continue;
          }
          if (usedBase64Chars + binary.length > MAX_TOTAL_BINARY_BASE64_CHARS) {
            omitted.push({ path: candidate.path, reason: 'presupuesto total binario agotado' });
            continue;
          }
          usedBase64Chars += binary.length;
          documents.push({
            sourceId: candidate.item.id,
            name: candidate.item.name,
            mimeType: content.mimeType,
            path: candidate.path,
            modifiedAt: new Date(candidate.item.modifiedAt),
            dataBase64: binary,
          });
          continue;
        }
        omitted.push({ path: candidate.path, reason: 'documento sin contenido analizable' });
      } catch {
        // No ocultar la pérdida de una fuente: el informe llegará al usuario.
        omitted.push({ path: candidate.path, reason: 'falló la lectura del archivo' });
      }
    }

    return {
      documents,
      coverage: {
        scannedItems: collection.scannedItems,
        eligibleDocuments: collection.candidates.length,
        analyzedDocuments: documents.length,
        scanTruncated: collection.scanTruncated,
        omitted,
      },
    };
  }

  private async collectCandidates(rootFolderId: string): Promise<CandidateCollection> {
    const queue: Array<{ folderId: string; path: string; depth: number }> = [
      { folderId: rootFolderId, path: '', depth: 1 },
    ];
    const candidates: Candidate[] = [];
    const omissions: DocumentCoverageOmission[] = [];
    const seenFiles = new Set<string>();
    const seenFolders = new Set<string>([rootFolderId]);
    let scannedItems = 0;
    let scanTruncated = false;

    while (queue.length > 0 && scannedItems < MAX_SCANNED_ITEMS) {
      const current = queue.shift()!;
      const children = await this.drive.listChildren(current.folderId);
      // Evita que el orden arbitrario de Drive esconda archivos críticos.
      const orderedChildren = [...children].sort((a, b) => {
        const aPriority = classifyDriveSource(a, current.path + '/' + a.name).priority;
        const bPriority = classifyDriveSource(b, current.path + '/' + b.name).priority;
        const score = (value: string) => value === 'recommended' ? 0 :
          value === 'secondary' ? 1 : 2;
        return score(aPriority) - score(bPriority) ||
          a.name.localeCompare(b.name, 'es');
      });

      for (const child of orderedChildren) {
        if (scannedItems >= MAX_SCANNED_ITEMS) {
          scanTruncated = true;
          break;
        }
        scannedItems++;
        const path = current.path ? current.path + '/' + child.name : child.name;
        const classification = classifyDriveSource(child, path);
        if (classification.priority === 'excluded') continue;

        if (child.itemType === 'folder') {
          if (current.depth < MAX_DEPTH && !seenFolders.has(child.id)) {
            seenFolders.add(child.id);
            queue.push({ folderId: child.id, path, depth: current.depth + 1 });
          } else if (current.depth >= MAX_DEPTH) {
            scanTruncated = true;
          }
          continue;
        }
        if (child.itemType !== 'file' || seenFiles.has(child.id)) continue;
        seenFiles.add(child.id);

        if (!canReadDriveSource(child.mimeType)) {
          omissions.push({ path, reason: 'formato no compatible con el lector' });
          continue;
        }
        if (child.sizeBytes !== null &&
            child.sizeBytes > MAX_BINARY_BYTES_PER_DOCUMENT) {
          omissions.push({ path, reason: 'archivo supera 5 MB' });
          continue;
        }
        candidates.push({
          item: child,
          path,
          rank: classification.priority === 'recommended' ? 0 : 1,
          topic: topicFor(path),
        });
      }
    }
    if (queue.length > 0) scanTruncated = true;
    return { candidates, omissions, scannedItems, scanTruncated };
  }
}
