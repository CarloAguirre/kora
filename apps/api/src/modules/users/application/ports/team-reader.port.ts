import type { TransactionContext } from '@kora/core';

/**
 * Lectura mínima de equipos que necesita el módulo de usuarios.
 *
 * El módulo de usuarios NO importa el repositorio completo de equipos: declara
 * la porción que le hace falta y otro módulo la satisface. Así los dos módulos
 * evolucionan por separado y este no arrastra a su test todo el dominio de
 * equipos.
 */

export interface TeamReference {
  readonly id: string;
  readonly name: string;
}

export interface TeamReader {
  findById(teamId: string, context?: TransactionContext): Promise<TeamReference | null>;
  findManyByIds(teamIds: readonly string[], context?: TransactionContext): Promise<TeamReference[]>;
}

export const TEAM_READER = Symbol('TeamReader');
