import { Inject, Injectable } from '@nestjs/common';
import { and, clientContacts, eq, notInArray, type Database } from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  ClientContactRecord,
  ClientContactRepository,
  UpsertClientContactInput,
} from '../../domain/repositories/client-contact.repository';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

@Injectable()
export class DrizzleClientContactRepository implements ClientContactRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async listForClient(
    clientId: string,
    context?: TransactionContext,
  ): Promise<ClientContactRecord[]> {
    const db = resolveDb(this.database, context);
    return db.select().from(clientContacts).where(eq(clientContacts.clientId, clientId));
  }

  async findById(id: string, context?: TransactionContext): Promise<ClientContactRecord | null> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(clientContacts).where(eq(clientContacts.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async upsert(input: UpsertClientContactInput, context?: TransactionContext): Promise<string> {
    const db = resolveDb(this.database, context);

    if (input.id) {
      await db
        .update(clientContacts)
        .set({
          name: input.name,
          position: input.position,
          email: input.email,
          phone: input.phone,
          updatedAt: new Date(),
        })
        .where(eq(clientContacts.id, input.id));
      return input.id;
    }

    const inserted = await db
      .insert(clientContacts)
      .values({
        clientId: input.clientId,
        name: input.name,
        position: input.position,
        email: input.email,
        phone: input.phone,
      })
      .returning({ id: clientContacts.id });

    const createdId = inserted[0]?.id;
    if (!createdId) throw new Error('La inserción de contacto no devolvió identificador.');
    return createdId;
  }

  async deleteById(id: string, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.delete(clientContacts).where(eq(clientContacts.id, id));
  }

  async deleteForClientExcept(
    clientId: string,
    keepIds: readonly string[],
    context?: TransactionContext,
  ): Promise<void> {
    const db = resolveDb(this.database, context);

    const conditions = [eq(clientContacts.clientId, clientId)];
    if (keepIds.length > 0) conditions.push(notInArray(clientContacts.id, [...keepIds]));

    await db.delete(clientContacts).where(and(...conditions));
  }
}
