import { Inject, Injectable } from '@nestjs/common';
import { mapPage, ok, type Page, type Result } from '@kora/core';
import type { ClientSummary, ListClientsQuery } from '@kora/contracts';
import { CLIENT_REPOSITORY, type ClientRepository } from '../../domain/repositories/client.repository';
import type { UseCase } from '../../../../shared/application/use-case';
import { toClientSummary } from '../mappers/client.mapper';

export interface ListClientsQueryCommand {
  readonly query: ListClientsQuery;
}

@Injectable()
export class ListClientsUseCase implements UseCase<ListClientsQueryCommand, Page<ClientSummary>> {
  constructor(@Inject(CLIENT_REPOSITORY) private readonly clients: ClientRepository) {}

  async execute(command: ListClientsQueryCommand): Promise<Result<Page<ClientSummary>>> {
    const { query } = command;

    const page = await this.clients.search(
      { search: query.search, status: query.status },
      { page: query.page, pageSize: query.pageSize },
      { field: query.sortField, direction: query.sortDirection },
    );

    return ok(mapPage(page, toClientSummary));
  }
}
