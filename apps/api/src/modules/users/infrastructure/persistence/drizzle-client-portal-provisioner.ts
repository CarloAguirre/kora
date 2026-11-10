import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  and, clientContacts, clientPortalAccounts, clients, eq, isNull, sql,
  type Database,
} from '@kora/db';
import type { TransactionContext } from '@kora/core';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';
import type { ClientPortalProvisioner } from '../../application/ports/client-portal-provisioner.port';

/**
 * El alta del usuario, su contacto y su vínculo al portal comparten la misma
 * transacción. Nunca concedemos acceso global a los proyectos de la empresa.
 */
@Injectable()
export class DrizzleClientPortalProvisioner implements ClientPortalProvisioner {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async provision(input: {
    readonly userId: string;
    readonly clientId: string;
    readonly email: string;
    readonly fullName: string;
    readonly actorUserId: string;
    readonly enabled: boolean;
  }, context: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    const [client] = await db.select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, input.clientId), eq(clients.status, 'active'), isNull(clients.deletedAt)))
      .limit(1);
    if (!client) throw new BadRequestException('Selecciona una empresa activa y existente para el usuario cliente.');

    const email = input.email.trim().toLowerCase();
    const existingContacts = await db.select({ id: clientContacts.id })
      .from(clientContacts)
      .where(and(
        eq(clientContacts.clientId, input.clientId),
        sql`lower(btrim(${clientContacts.email})) = ${email}`,
      ))
      .limit(2);

    if (existingContacts.length > 1) {
      throw new ConflictException('La empresa tiene varios contactos con ese correo. Unifícalos antes de crear el usuario.');
    }
    let contactId = existingContacts[0]?.id;
    if (contactId) {
      const [linked] = await db.select({ userId: clientPortalAccounts.userId })
        .from(clientPortalAccounts).where(eq(clientPortalAccounts.contactId, contactId)).limit(1);
      if (linked && linked.userId !== input.userId) {
        throw new ConflictException('Este contacto ya está vinculado a otra cuenta del portal.');
      }
    } else {
      const [inserted] = await db.insert(clientContacts)
        .values({
          clientId: input.clientId,
          name: input.fullName.trim(),
          email,
          position: null,
          phone: null,
        })
        .returning({ id: clientContacts.id });
      contactId = inserted?.id;
      if (!contactId) throw new Error('No se pudo registrar el contacto del usuario cliente.');
    }

    await db.insert(clientPortalAccounts).values({
      userId: input.userId,
      clientId: input.clientId,
      contactId,
      enabled: input.enabled,
      updatedBy: input.actorUserId,
    });
  }
}
