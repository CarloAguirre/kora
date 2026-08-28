import { Inject, Injectable } from '@nestjs/common';
import { CLIENT_REPOSITORY, type ClientRepository } from '../../../clients/domain/repositories/client.repository';
import type { ForecastClientReader, ForecastClientReference } from '../../application/ports/forecast-client-reader.port';

@Injectable()
export class ClientsModuleForecastClientReader implements ForecastClientReader {
  constructor(@Inject(CLIENT_REPOSITORY) private readonly clients: ClientRepository) {}

  async findById(clientId: string): Promise<ForecastClientReference | null> {
    const client = await this.clients.findById(clientId);
    if (!client) return null;
    return { id: client.id, companyName: client.companyName };
  }
}
