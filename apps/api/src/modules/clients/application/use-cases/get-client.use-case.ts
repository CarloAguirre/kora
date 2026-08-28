import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import type { ClientDetail } from '@kora/contracts';
import { ClientNotFoundError } from '../../domain/errors/client.errors';
import { CLIENT_REPOSITORY, type ClientRepository } from '../../domain/repositories/client.repository';
import {
  CLIENT_CONTACT_REPOSITORY,
  type ClientContactRepository,
} from '../../domain/repositories/client-contact.repository';
import { CATALOG_READER, type CatalogReader } from '../ports/catalog-reader.port';
import {
  COMMERCIAL_MANAGER_READER,
  type CommercialManagerReader,
} from '../ports/commercial-manager-reader.port';
import type { UseCase } from '../../../../shared/application/use-case';
import { toClientDetail } from '../mappers/client.mapper';

export interface GetClientCommand {
  readonly clientId: string;
}

@Injectable()
export class GetClientUseCase implements UseCase<GetClientCommand, ClientDetail, ApplicationError> {
  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clients: ClientRepository,
    @Inject(CLIENT_CONTACT_REPOSITORY) private readonly contacts: ClientContactRepository,
    @Inject(CATALOG_READER) private readonly catalogs: CatalogReader,
    @Inject(COMMERCIAL_MANAGER_READER) private readonly commercialManagers: CommercialManagerReader,
  ) {}

  async execute(command: GetClientCommand): Promise<Result<ClientDetail, ApplicationError>> {
    const client = await this.clients.findById(command.clientId);
    if (!client || client.isDeleted) return err(new ClientNotFoundError(command.clientId));

    const snapshot = client.toSnapshot();

    const [country, comuna, industry, businessSector, manager, contacts] = await Promise.all([
      snapshot.countryId ? this.catalogs.findCountry(snapshot.countryId) : Promise.resolve(null),
      snapshot.comunaId ? this.catalogs.findComuna(snapshot.comunaId) : Promise.resolve(null),
      snapshot.industryId ? this.catalogs.findIndustry(snapshot.industryId) : Promise.resolve(null),
      snapshot.businessSectorId
        ? this.catalogs.findBusinessSector(snapshot.businessSectorId)
        : Promise.resolve(null),
      snapshot.commercialManagerUserId
        ? this.commercialManagers.findById(snapshot.commercialManagerUserId)
        : Promise.resolve(null),
      this.contacts.listForClient(client.id),
    ]);

    const primaryContact = contacts.find((contact) => contact.id === snapshot.primaryContactId);

    return ok(
      toClientDetail({
        client,
        commercialManagerName: manager?.fullName ?? null,
        country,
        comuna,
        industry,
        businessSector,
        contacts,
        primaryContactName: primaryContact?.name ?? null,
        primaryContactEmail: primaryContact?.email ?? null,
        primaryContactPhone: primaryContact?.phone ?? null,
      }),
    );
  }
}
