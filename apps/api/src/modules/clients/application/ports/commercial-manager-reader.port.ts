/**
 * Lectura mínima de usuarios que necesita el módulo de clientes: quién puede
 * ser responsable comercial.
 *
 * Igual que `TeamReader` en el módulo de usuarios: se declara aquí la porción
 * exacta que este módulo consume, y el módulo de usuarios la satisface. Evita
 * que clientes dependa del dominio completo de usuarios.
 */
export interface CommercialManagerReference {
  readonly id: string;
  readonly fullName: string;
  readonly isCommercialManager: boolean;
}

export interface CommercialManagerReader {
  findById(userId: string): Promise<CommercialManagerReference | null>;
  findManyByIds(userIds: readonly string[]): Promise<CommercialManagerReference[]>;
}

export const COMMERCIAL_MANAGER_READER = Symbol('CommercialManagerReader');
