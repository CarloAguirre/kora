import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@kora/db';
import type { TransactionContext, UnitOfWork } from '@kora/core';
import { DATABASE } from './database.module';

/**
 * Contexto de transacción real. Envuelve la conexión transaccional de Drizzle
 * bajo el tipo opaco que declara `@kora/core`, para que la capa de aplicación
 * pueda pasar la transacción de un repositorio a otro sin conocer el ORM.
 */
export interface DrizzleTransactionContext extends TransactionContext {
  readonly tx: Database;
}

export function isDrizzleTransaction(
  context: TransactionContext | undefined,
): context is DrizzleTransactionContext {
  return Boolean(context && 'tx' in context);
}

/**
 * Implementación de la unidad de trabajo sobre transacciones de Postgres.
 *
 * Quien decide el límite transaccional es el caso de uso —"crear el usuario y
 * sus credenciales es una sola operación"—, no el repositorio. En la v1 esa
 * atomicidad se conseguía con una función PL/pgSQL de cientos de líneas
 * (`create_user_access_atomic`) que solo era revisable en la consola de
 * Supabase; aquí es una transacción explícita en código versionado.
 */
@Injectable()
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async run<T>(work: (context: TransactionContext) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      const context: DrizzleTransactionContext = {
        _brand: 'TransactionContext',
        tx: tx as unknown as Database,
      };
      return work(context);
    });
  }
}

/**
 * Ayuda para los repositorios: usa la conexión de la transacción en curso si la
 * hay, y la conexión normal si no. Permite que el mismo método de repositorio
 * sirva dentro y fuera de una transacción.
 */
export function resolveDb(defaultDb: Database, context?: TransactionContext): Database {
  return isDrizzleTransaction(context) ? context.tx : defaultDb;
}
