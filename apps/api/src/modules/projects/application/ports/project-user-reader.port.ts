/** Lectura mínima de usuarios que necesita el módulo de proyectos: nombres de líder, desarrollador y responsable comercial. */
export interface ProjectUserReference {
  readonly id: string;
  readonly fullName: string;
}

export interface ProjectUserReader {
  findById(userId: string): Promise<ProjectUserReference | null>;
  findManyByIds(userIds: readonly string[]): Promise<ProjectUserReference[]>;
}

export const PROJECT_USER_READER = Symbol('ProjectUserReader');
