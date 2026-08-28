import { Inject, Injectable } from '@nestjs/common';
import { CLIENT_REPOSITORY, type ClientRepository } from '../../../clients/domain/repositories/client.repository';
import type { TicketClientReader, TicketClientReference } from '../../application/ports/ticket-client-reader.port';

@Injectable()
export class ClientsModuleTicketClientReader implements TicketClientReader {
  constructor(@Inject(CLIENT_REPOSITORY) private readonly clients: ClientRepository) {}

  async findById(clientId: string): Promise<TicketClientReference | null> {
    const client = await this.clients.findById(clientId);
    if (!client) return null;
    return { id: client.id, companyName: client.companyName };
  }
}
