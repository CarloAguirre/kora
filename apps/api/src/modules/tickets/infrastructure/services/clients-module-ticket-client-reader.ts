import { Inject, Injectable } from '@nestjs/common';
import { CLIENT_REPOSITORY, type ClientRepository } from '../../../clients/domain/repositories/client.repository';
import {
  CLIENT_CONTACT_REPOSITORY,
  type ClientContactRepository,
} from '../../../clients/domain/repositories/client-contact.repository';
import type { TicketClientContactReference, TicketClientReader, TicketClientReference } from '../../application/ports/ticket-client-reader.port';

@Injectable()
export class ClientsModuleTicketClientReader implements TicketClientReader {
  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clients: ClientRepository,
    @Inject(CLIENT_CONTACT_REPOSITORY) private readonly contacts: ClientContactRepository,
  ) {}

  async findById(clientId: string): Promise<TicketClientReference | null> {
    const client = await this.clients.findById(clientId);
    if (!client) return null;

    const primaryContact = client.primaryContactId ? await this.findContact(clientId, client.primaryContactId) : null;
    return { id: client.id, companyName: client.companyName, primaryContact };
  }

  async findCompanyNames(clientIds: readonly string[]): Promise<Map<string, string>> {
    const found = await this.clients.findManyByIds([...new Set(clientIds)]);
    return new Map(found.map((client) => [client.id, client.companyName]));
  }

  async findContact(clientId: string, contactId: string): Promise<TicketClientContactReference | null> {
    const contact = await this.contacts.findById(contactId);
    if (!contact || contact.clientId !== clientId) return null;
    return { id: contact.id, name: contact.name, position: contact.position, email: contact.email, phone: contact.phone };
  }
}
