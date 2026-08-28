import { Inject, Injectable } from '@nestjs/common';
import { asc, businessSectors, comunas, countries, eq, industries, users, type Database } from '@kora/db';
import type { CatalogOption } from '@kora/contracts';
import type { ClientCatalogLister } from '../../application/ports/client-catalog-lister.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';

@Injectable()
export class DrizzleClientCatalogLister implements ClientCatalogLister {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async listCountries(): Promise<CatalogOption[]> {
    return this.database.select({ id: countries.id, name: countries.name }).from(countries).orderBy(asc(countries.name));
  }

  async listComunas(): Promise<CatalogOption[]> {
    return this.database.select({ id: comunas.id, name: comunas.name }).from(comunas).orderBy(asc(comunas.name));
  }

  async listIndustries(): Promise<CatalogOption[]> {
    return this.database.select({ id: industries.id, name: industries.name }).from(industries).orderBy(asc(industries.name));
  }

  async listBusinessSectors(): Promise<CatalogOption[]> {
    return this.database
      .select({ id: businessSectors.id, name: businessSectors.name })
      .from(businessSectors)
      .orderBy(asc(businessSectors.name));
  }

  async listCommercialManagers(): Promise<CatalogOption[]> {
    const rows = await this.database
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.isCommercialManager, true))
      .orderBy(asc(users.firstName));

    return rows.map((row) => ({ id: row.id, name: `${row.firstName} ${row.lastName}`.trim() }));
  }
}
