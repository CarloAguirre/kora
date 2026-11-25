import { Inject, Injectable } from '@nestjs/common';
import {
  and, clientContacts, clientPortalAccounts, clients, eq, isNull, sql,
  type Database,
} from '@kora/db';
import { DATABASE } from '../../../shared/infrastructure/database/database.module';

/**
 * Permite correos externos SOLO cuando un contacto fue invitado y habilitado.
 * Se consulta en cada login: revocar un contacto bloquea nuevos inicios
 * aunque el correo coincida con un dominio corporativo permitido.
 * La autorización de CADA GET/POST sigue validándose en ClientPortalService.
 */
@Injectable()
export class ClientPortalLoginAccessService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async isEnabled(userId: string, email: string): Promise<boolean> {
    const [entry] = await this.db.select({ userId: clientPortalAccounts.userId })
      .from(clientPortalAccounts)
      .innerJoin(clients, eq(clients.id, clientPortalAccounts.clientId))
      .innerJoin(clientContacts, eq(clientContacts.id, clientPortalAccounts.contactId))
      .where(and(
        eq(clientPortalAccounts.userId, userId),
        eq(clientPortalAccounts.enabled, true),
        eq(clients.status, 'active'),
        isNull(clients.deletedAt),
        eq(clientContacts.clientId, clientPortalAccounts.clientId),
        sql`lower(btrim(${clientContacts.email})) = ${email.trim().toLowerCase()}`,
      )).limit(1);
    return !!entry;
  }
}
