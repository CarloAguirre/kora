/** Lectura mínima de contactos de cliente que necesita el módulo de proyectos. */
export interface ProjectContactReference {
  readonly id: string;
  readonly name: string;
  readonly position: string | null;
  readonly email: string | null;
  readonly phone: string | null;
}

export interface ProjectContactReader {
  findById(contactId: string): Promise<ProjectContactReference | null>;
}

export const PROJECT_CONTACT_READER = Symbol('ProjectContactReader');
