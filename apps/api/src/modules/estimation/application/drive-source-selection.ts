import type {
  EstimationDriveFileKind,
  EstimationDriveSourcePriority,
} from '@kora/contracts';
import type { DriveFolderItem } from './ports/drive-folder-client.port';

export interface DriveSourceClassification {
  readonly priority: EstimationDriveSourcePriority;
  readonly reason: string | null;
}

export function classifyDriveSource(
  item: DriveFolderItem,
  path: string,
): DriveSourceClassification {
  const value = normalize(`${path} ${item.name}`);

  if (
    /(password|contrasena|secret|credencial|credential|private key|api key)/.test(value) ||
    /(^|\s)acceso(s)?(\s|$)/.test(value) ||
    item.mimeType === 'application/vnd.android.package-archive'
  ) {
    return {
      priority: 'excluded',
      reason:
        'Se excluye por seguridad o por no aportar contenido documental al análisis.',
    };
  }

  if (/(antiguo|backup|respaldo|deprecated|historico obsoleto)/.test(value)) {
    return {
      priority: 'excluded',
      reason:
        'Se excluye por defecto por corresponder a respaldo o material antiguo.',
    };
  }

  if (
    /(levantamiento|requerimiento|especificacion|arquitectura|as is|to be|flujo|proceso|caso de uso|historia de usuario|kick ?off|matriz funcional|documentacion por modulos|alcance|propuesta tecnica)/.test(
      value,
    )
  ) {
    return {
      priority: 'recommended',
      reason:
        'El nombre/ruta indica un antecedente de alto valor para estimación.',
    };
  }

  return {
    priority: 'secondary',
    reason: null,
  };
}

export function classifyDriveKind(
  mimeType: string,
): EstimationDriveFileKind {
  if (
    mimeType === 'application/vnd.google-apps.document' ||
    mimeType.includes('wordprocessingml') ||
    mimeType === 'application/msword' ||
    mimeType.startsWith('text/')
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

export function canReadDriveSource(mimeType: string): boolean {
  return (
    mimeType === 'application/vnd.google-apps.document' ||
    mimeType === 'application/vnd.google-apps.spreadsheet' ||
    mimeType === 'application/vnd.google-apps.presentation' ||
    mimeType === 'application/pdf' ||
    mimeType === 'application/json' ||
    [
      'text/plain',
      'text/markdown',
      'text/csv',
      'text/tab-separated-values',
      'text/html',
      'text/xml',
      'text/rtf',
    ].includes(mimeType)
  );
}

export function extractDriveFolderId(value: string): string | null {
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

export function normalizeDriveLabel(value: string): string {
  return normalize(value);
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
