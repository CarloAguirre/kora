import type { TransactionContext } from '@kora/core';

/**
 * Contactos de un cliente.
 *
 * Puerto separado del de clientes (no un array embebido en `Client`) porque un
 * contacto tiene su propio ciclo de vida administrativo — se agrega, se edita,
 * se elimina— sin que eso sea, en sí, un cambio del agregado cliente. El caso
 * de uso de actualización orquesta ambos.
 */
export interface ClientContactRecord {
  readonly id: string;
  readonly clientId: string;
  readonly name: string;
  readonly position: string | null;
  readonly email: string | null;
  readonly phone: string | null;
}

export interface UpsertClientContactInput {
  readonly id?: string;
  readonly clientId: string;
  readonly name: string;
  readonly position: string | null;
  readonly email: string | null;
  readonly phone: string | null;
}

export interface ClientContactRepository {
  listForClient(clientId: string, context?: TransactionContext): Promise<ClientContactRecord[]>;
  findById(id: string, context?: TransactionContext): Promise<ClientContactRecord | null>;

  /** Crea o actualiza según traiga `id`. Devuelve el identificador resultante. */
  upsert(input: UpsertClientContactInput, context?: TransactionContext): Promise<string>;

  deleteById(id: string, context?: TransactionContext): Promise<void>;

  /** Elimina los contactos del cliente que no estén en la lista dada. */
  deleteForClientExcept(
    clientId: string,
    keepIds: readonly string[],
    context?: TransactionContext,
  ): Promise<void>;
}

export const CLIENT_CONTACT_REPOSITORY = Symbol('ClientContactRepository');
