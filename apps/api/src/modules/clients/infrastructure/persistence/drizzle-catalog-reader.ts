import { Inject, Injectable } from '@nestjs/common';
import { businessSectors, comunas, countries, eq, inArray, industries, type Database } from '@kora/db';
import type { CatalogEntry, CatalogReader } from '../../application/ports/catalog-reader.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';

const TABLE_BY_KIND = { country: countries, comuna: comunas, industry: industries, businessSector: businessSectors };

@Injectable()
export class DrizzleCatalogReader implements CatalogReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findCountry(id: string): Promise<CatalogEntry | null> {
    return this.findOne(countries, id);
  }

  async findComuna(id: string): Promise<CatalogEntry | null> {
    return this.findOne(comunas, id);
  }

  async findIndustry(id: string): Promise<CatalogEntry | null> {
    return this.findOne(industries, id);
  }

  async findBusinessSector(id: string): Promise<CatalogEntry | null> {
    return this.findOne(businessSectors, id);
  }

  async findManyByIds(
    kind: 'country' | 'comuna' | 'industry' | 'businessSector',
    ids: readonly string[],
  ): Promise<CatalogEntry[]> {
    if (ids.length === 0) return [];
    const table = TABLE_BY_KIND[kind];
    return this.database
      .select({ id: table.id, name: table.name })
      .from(table)
      .where(inArray(table.id, [...ids]));
  }

  private async findOne(
    table: typeof countries | typeof comunas | typeof industries | typeof businessSectors,
    id: string,
  ): Promise<CatalogEntry | null> {
    const rows = await this.database
      .select({ id: table.id, name: table.name })
      .from(table)
      .where(eq(table.id, id))
      .limit(1);
    return rows[0] ?? null;
  }
}
