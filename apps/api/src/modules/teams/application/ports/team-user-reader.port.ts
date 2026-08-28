/**
 * Lectura mínima de usuarios que necesita el módulo de equipos: resolver el
 * nombre del líder. Mismo patrón que `CommercialManagerReader` en clientes —
 * un puerto local y acotado en vez de importar el dominio de usuarios.
 */
export interface TeamUserReference {
  readonly id: string;
  readonly fullName: string;
}

export interface TeamUserReader {
  findById(userId: string): Promise<TeamUserReference | null>;
}

export const TEAM_USER_READER = Symbol('TeamUserReader');
