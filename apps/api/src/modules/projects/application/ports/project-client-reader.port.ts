/** Lectura mínima de clientes que necesita el módulo de proyectos. */
export interface ProjectClientReference {
  readonly id: string;
  readonly companyName: string;
}

export interface ProjectClientReader {
  findById(clientId: string): Promise<ProjectClientReference | null>;
}

export const PROJECT_CLIENT_READER = Symbol('ProjectClientReader');
