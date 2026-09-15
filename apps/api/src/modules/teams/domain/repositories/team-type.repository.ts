import type { TransactionContext } from '@kora/core';

/**
 * Catálogo de tipos de equipo (UX-UI, Desarrollo, QA, ...). Es un catálogo
 * abierto: cualquiera con `teams:manage` puede agregar tipos nuevos desde el
 * formulario de equipo. No tiene invariantes de negocio más allá de "nombre no
 * vacío/no duplicado", así que no amerita una entidad de dominio propia.
 */
export interface TeamTypeRecord {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly icon: string;
  readonly createdAt: Date;
}

export interface CreateTeamTypeData {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly icon: string;
  readonly now: Date;
}

export interface TeamTypeRepository {
  list(context?: TransactionContext): Promise<TeamTypeRecord[]>;
  findById(id: string, context?: TransactionContext): Promise<TeamTypeRecord | null>;
  nameIsTaken(name: string, context?: TransactionContext): Promise<boolean>;
  create(data: CreateTeamTypeData, context?: TransactionContext): Promise<TeamTypeRecord>;
}

export const TEAM_TYPE_REPOSITORY = Symbol('TeamTypeRepository');
