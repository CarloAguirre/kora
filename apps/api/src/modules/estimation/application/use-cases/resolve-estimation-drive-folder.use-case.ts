import { Inject, Injectable } from '@nestjs/common';
import {
  estimationDriveFolderResolutionSchema,
  type EstimationDriveFolderCandidate,
  type EstimationDriveFolderResolution,
  type ResolveEstimationDriveFolderInput,
} from '@kora/contracts';
import {
  DRIVE_FOLDER_CLIENT,
  type DriveFolderClient,
  type DriveFolderItem,
} from '../ports/drive-folder-client.port';

const GENERIC_PROJECT_TOKENS = new Set([
  'app',
  'aplicacion',
  'proyecto',
  'sistema',
  'modulo',
  'plataforma',
  'web',
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'y',
  'para',
  'con',
]);

@Injectable()
export class ResolveEstimationDriveFolderUseCase {
  constructor(
    @Inject(DRIVE_FOLDER_CLIENT)
    private readonly drive: DriveFolderClient,
  ) {}

  async execute(
    userId: string,
    input: ResolveEstimationDriveFolderInput,
  ): Promise<EstimationDriveFolderResolution> {
    const connected = await this.drive.isConnected(userId);
    const explicitFolderId = extractDriveFolderId(input.documentationLink);
    if (explicitFolderId) {
      return estimationDriveFolderResolutionSchema.parse({
        connection: connected ? 'connected' : 'not_connected',
        status: 'resolved',
        selectedFolder: {
          folderId: explicitFolderId,
          name: 'Carpeta documental vinculada',
          url: canonicalFolderUrl(explicitFolderId),
          score: 100,
          confidence: 'high',
          reasons: ['Vínculo explícito guardado en documentationLink.'],
          ancestorNames: [],
        },
        candidates: [],
        message: connected
          ? null
          : 'La carpeta está vinculada, pero debes conectar Google Drive para inspeccionarla con tus permisos.',
      });
    }

    if (!connected) {
      return estimationDriveFolderResolutionSchema.parse({
        connection: 'not_connected',
        status: 'not_found',
        selectedFolder: null,
        candidates: [],
        message:
          'Conecta Google Drive con tu cuenta para descubrir carpetas usando tus permisos.',
      });
    }

    try {
      const discovered = new Map<string, DriveFolderItem>();
      const projectTerms = significantTerms(input.projectName);
      const clientTerms = significantTerms(input.clientName ?? '');

      for (const folder of await this.drive.searchFolders(userId, projectTerms)) {
        if (folder.itemType === 'folder') discovered.set(folder.id, folder);
      }

      if (clientTerms.length > 0) {
        const clientRoots = (await this.drive.searchFolders(userId, clientTerms))
          .filter((item) => item.itemType === 'folder')
          .sort(
            (a, b) =>
              nameSimilarity(b.name, input.clientName ?? '') -
              nameSimilarity(a.name, input.clientName ?? ''),
          )
          .slice(0, 3);

        for (const root of clientRoots) {
          for (const child of await this.drive.listChildren(userId, root.id)) {
            if (child.itemType === 'folder') discovered.set(child.id, child);
          }
        }
      }

      const quotationFolderId = extractDriveFolderId(input.quotationLink);
      if (quotationFolderId && !discovered.has(quotationFolderId)) {
        const metadata = await this.drive.getMetadata(userId, quotationFolderId);
        if (metadata?.mimeType === 'application/vnd.google-apps.folder') {
          discovered.set(quotationFolderId, {
            ...metadata,
            itemType: 'folder',
            sizeBytes: null,
          });
        }
      }

      const scored: EstimationDriveFolderCandidate[] = [];
      for (const folder of discovered.values()) {
        const ancestorNames = await this.getAncestorNames(
          userId,
          folder.parentIds,
          3,
        );
        const reasons: string[] = [];
        let score = scoreFolderName(folder.name, input.projectName, reasons);

        if (matchesClientAncestor(ancestorNames, input.clientName)) {
          score += 25;
          reasons.push('La jerarquía contiene una carpeta compatible con el cliente.');
        }

        if (quotationFolderId === folder.id) {
          score = Math.max(score, 60);
          reasons.push('La carpeta aparece actualmente en quotationLink.');
        }

        if (looksLikeDocumentationFolder(folder.name)) {
          score += 5;
          reasons.push('El nombre sugiere documentación o levantamiento.');
        }

        score = Math.min(100, Math.round(score));
        if (score < 25) continue;

        scored.push({
          folderId: folder.id,
          name: folder.name,
          url: folder.webViewLink ?? canonicalFolderUrl(folder.id),
          score,
          confidence: score >= 80 ? 'high' : score >= 55 ? 'medium' : 'low',
          reasons,
          ancestorNames,
        });
      }

      scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
      const candidates = scored.slice(0, 8);
      const first = candidates[0] ?? null;
      const second = candidates[1] ?? null;
      const autoResolved =
        first !== null &&
        first.score >= 80 &&
        (second === null || first.score - second.score >= 10);

      return estimationDriveFolderResolutionSchema.parse({
        connection: 'connected',
        status: autoResolved
          ? 'resolved'
          : candidates.length > 0
            ? 'needs_confirmation'
            : 'not_found',
        selectedFolder: autoResolved ? first : null,
        candidates,
        message: autoResolved
          ? 'Kora encontró una carpeta con alta confianza.'
          : candidates.length > 0
            ? 'Kora encontró carpetas candidatas. Confirma cuál corresponde al prospecto.'
            : 'No se encontraron carpetas suficientemente relacionadas con este prospecto.',
      });
    } catch (error) {
      return estimationDriveFolderResolutionSchema.parse({
        connection: 'unavailable',
        status: 'not_found',
        selectedFolder: null,
        candidates: [],
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible consultar Google Drive.',
      });
    }
  }

  private async getAncestorNames(
    userId: string,
    parentIds: readonly string[],
    maxDepth: number,
  ): Promise<string[]> {
    const result: string[] = [];
    let currentId = parentIds[0] ?? null;

    for (let depth = 0; currentId && depth < maxDepth; depth += 1) {
      const metadata = await this.drive.getMetadata(userId, currentId);
      if (!metadata) break;
      result.push(metadata.name);
      currentId = metadata.parentIds[0] ?? null;
    }

    return result;
  }
}

function significantTerms(value: string): string[] {
  const originalTokens = value
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);

  const filtered = originalTokens.filter((token) => {
    const normalized = normalize(token);
    return normalized.length >= 3 && !GENERIC_PROJECT_TOKENS.has(normalized);
  });

  return (filtered.length > 0 ? filtered : originalTokens)
    .sort((a, b) => b.length - a.length)
    .slice(0, 4);
}

function scoreFolderName(
  folderName: string,
  projectName: string,
  reasons: string[],
): number {
  const folder = normalize(folderName);
  const project = normalize(projectName);
  const folderTokens = tokenSet(folderName);
  const projectTokens = tokenSet(projectName);

  if (folder === project) {
    reasons.push('El nombre de la carpeta coincide con el proyecto.');
    return 85;
  }

  let score = 0;
  if (folder.includes(project) || project.includes(folder)) {
    score += 50;
    reasons.push('El nombre de la carpeta contiene el nombre del proyecto o viceversa.');
  }

  const intersection = [...projectTokens].filter((token) => folderTokens.has(token));
  const denominator = Math.max(1, projectTokens.size);
  const overlap = intersection.length / denominator;
  if (overlap > 0) {
    score += overlap * 45;
    reasons.push(
      `Coincidencia de términos del proyecto: ${intersection.join(', ')}.`,
    );
  }

  return score;
}

function nameSimilarity(left: string, right: string): number {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / Math.max(leftTokens.size, rightTokens.size);
}

function matchesClientAncestor(
  ancestorNames: readonly string[],
  clientName: string | null | undefined,
): boolean {
  if (!clientName) return false;
  const client = normalize(clientName);
  const clientTokens = tokenSet(clientName);

  return ancestorNames.some((name) => {
    const ancestor = normalize(name);
    if (ancestor.includes(client) || client.includes(ancestor)) return true;

    const ancestorTokens = tokenSet(name);
    return [...clientTokens].some((token) => ancestorTokens.has(token));
  });
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split(/\s+/)
      .filter(
        (token) =>
          token.length >= 3 && !GENERIC_PROJECT_TOKENS.has(token),
      ),
  );
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

function looksLikeDocumentationFolder(name: string): boolean {
  const value = normalize(name);
  return (
    value.includes('documentacion') ||
    value.includes('levantamiento') ||
    value.includes('requerimiento')
  );
}

function extractDriveFolderId(value: string | null | undefined): string | null {
  if (!value) return null;
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

function canonicalFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
