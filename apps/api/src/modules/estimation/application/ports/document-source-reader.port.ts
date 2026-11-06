export const DOCUMENT_SOURCE_READER = Symbol('DOCUMENT_SOURCE_READER');

export interface ProjectSourceDocument {
  readonly sourceId: string;
  readonly name: string;
  readonly mimeType: string;
  readonly path: string;
  readonly modifiedAt?: Date;
  readonly text?: string;
  readonly dataBase64?: string;
}

/**
 * Puerto de fuentes documentales ya seleccionadas para análisis.
 *
 * La capa de aplicación entrega una carpeta raíz; el adaptador concreto
 * recorre Drive, selecciona antecedentes relevantes y normaliza el contenido
 * soportado sin exponer detalles de la API de Google al caso de uso.
 */
export interface DocumentSourceReader {
  readDriveSources(
    driveFolderUrl: string,
  ): Promise<readonly ProjectSourceDocument[]>;
  readDriveSourcesWithCoverage?(
    driveFolderUrl: string,
  ): Promise<DocumentSourceReadResult>;
}


export interface DocumentCoverageOmission {
  readonly path: string;
  readonly reason: string;
}

/** Se informa por cada lectura: ningún documento descartado se oculta. */
export interface DocumentSourceCoverage {
  readonly scannedItems: number;
  readonly eligibleDocuments: number;
  readonly analyzedDocuments: number;
  readonly scanTruncated: boolean;
  readonly omitted: readonly DocumentCoverageOmission[];
}

export interface DocumentSourceReadResult {
  readonly documents: readonly ProjectSourceDocument[];
  readonly coverage: DocumentSourceCoverage | null;
}

/**
 * Retrocompatible con los lectores de prueba y proveedores existentes:
 * los adaptadores antiguos pueden implementar solo readDriveSources.
 */
export async function readEstimationDocuments(
  reader: DocumentSourceReader,
  driveFolderUrl: string,
): Promise<DocumentSourceReadResult> {
  if (reader.readDriveSourcesWithCoverage) {
    return reader.readDriveSourcesWithCoverage(driveFolderUrl);
  }
  return {
    documents: await reader.readDriveSources(driveFolderUrl),
    coverage: null,
  };
}

export function describeDocumentCoverage(
  coverage: DocumentSourceCoverage | null,
): string | null {
  if (!coverage || (!coverage.scanTruncated && coverage.omitted.length === 0)) {
    return null;
  }
  const examples = coverage.omitted.slice(0, 8)
    .map((entry) => entry.path + ' (' + entry.reason + ')').join('; ');
  const extra = Math.max(0, coverage.omitted.length - 8);
  return 'COBERTURA DOCUMENTAL PARCIAL: se analizaron ' +
    coverage.analyzedDocuments + ' de ' + coverage.eligibleDocuments +
    ' documentos compatibles detectados. ' +
    (coverage.scanTruncated
      ? 'El inventario alcanzó el límite de exploración; pueden existir más archivos. '
      : '') +
    (examples ? 'Omitidos: ' + examples + (extra ? '; y otros ' + extra : '') + '. ' : '') +
    'No afirmes cobertura total ni inventes requisitos ausentes. ' +
    'Revisa el inventario de Drive antes de aprobar las HH.';
}
