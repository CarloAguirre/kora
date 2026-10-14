import { Inject, Injectable } from '@nestjs/common';
import { ok, type Result } from '@kora/core';
import type { CatalogOption } from '@kora/contracts';
import {
  CLIENT_CATALOG_LISTER,
  type ClientCatalogLister,
  type ComunaOption,
} from '../ports/client-catalog-lister.port';
import type { UseCase } from '../../../../shared/application/use-case';

export interface ClientFormOptions {
  readonly countries: readonly CatalogOption[];
  readonly comunas: readonly ComunaOption[];
  readonly industries: readonly CatalogOption[];
  readonly businessSectors: readonly CatalogOption[];
  readonly commercialManagers: readonly CatalogOption[];
}

/**
 * Reúne todo lo que necesita el formulario de cliente: los cuatro catálogos y
 * la lista de personas marcadas como responsable comercial.
 *
 * Es una consulta agregada deliberada: el formulario necesita las cinco listas
 * a la vez para poblar sus selectores, y pedirlas por separado significaría
 * cinco viajes de red donde uno basta.
 */
@Injectable()
export class ListClientFormOptionsUseCase implements UseCase<void, ClientFormOptions> {
  constructor(
    @Inject(CLIENT_CATALOG_LISTER) private readonly catalogs: ClientCatalogLister,
  ) {}

  async execute(): Promise<Result<ClientFormOptions>> {
    const [countries, comunas, industries, businessSectors, commercialManagers] =
      await Promise.all([
        this.catalogs.listCountries(),
        this.catalogs.listComunas(),
        this.catalogs.listIndustries(),
        this.catalogs.listBusinessSectors(),
        this.catalogs.listCommercialManagers(),
      ]);

    return ok({ countries, comunas, industries, businessSectors, commercialManagers });
  }
}
