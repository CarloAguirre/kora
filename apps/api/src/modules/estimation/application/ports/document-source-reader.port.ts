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
    userId: string,
    driveFolderUrl: string,
  ): Promise<readonly ProjectSourceDocument[]>;
}
