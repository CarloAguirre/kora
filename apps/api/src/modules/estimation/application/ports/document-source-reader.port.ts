export const DOCUMENT_SOURCE_READER = Symbol('DOCUMENT_SOURCE_READER');

export interface ProjectSourceDocument {
  readonly sourceId: string;
  readonly name: string;
  readonly mimeType: string;
  readonly modifiedAt?: Date;
  /**
   * Contenido ya normalizado para análisis. El adaptador concreto de Drive es
   * responsable de descargar/exportar cada formato; la capa de aplicación no
   * conoce APIs de Google.
   */
  readonly content: string;
}

export interface DocumentSourceReader {
  readProjectSources(projectId: string): Promise<readonly ProjectSourceDocument[]>;
}
