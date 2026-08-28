import { Inject, Injectable } from '@nestjs/common';
import { ok, type Result } from '@kora/core';
import type { ClientsStats } from '@kora/contracts';
import { CLIENT_REPOSITORY, type ClientRepository } from '../../domain/repositories/client.repository';
import type { UseCase } from '../../../../shared/application/use-case';

/** Conteos por estado y por país para las cards del listado. Ver `ClientRepository.stats`. */
@Injectable()
export class GetClientsStatsUseCase implements UseCase<void, ClientsStats> {
  constructor(@Inject(CLIENT_REPOSITORY) private readonly clients: ClientRepository) {}

  async execute(): Promise<Result<ClientsStats>> {
    const stats = await this.clients.stats();

    return ok({
      activeCount: stats.activeCount,
      inactiveCount: stats.inactiveCount,
      totalCount: stats.activeCount + stats.inactiveCount,
      byCountry: [...stats.byCountry],
    });
  }
}
