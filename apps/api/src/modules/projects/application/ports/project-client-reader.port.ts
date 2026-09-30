/** Lectura mínima de clientes que necesita el módulo de proyectos. */
export interface ProjectClientReference {
  readonly id: string;
  readonly companyName: string;
  /** Contacto principal del cliente — el que "hereda" un proyecto creado con "usar el contacto del cliente" (sin `primaryContactId` propio). */
  readonly primaryContactId?: string | null;
}

export interface ProjectClientReader {
  findById(clientId: string): Promise<ProjectClientReference | null>;
}

export const PROJECT_CLIENT_READER = Symbol('ProjectClientReader');
