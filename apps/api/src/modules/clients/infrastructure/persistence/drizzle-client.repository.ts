import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  clientContacts,
  clients,
  count,
  countries,
  desc,
  eq,
  ilike,
  industries,
  isNull,
  isUuid,
  ne,
  or,
  users,
  type Database,
} from '@kora/db';
import { buildPage, toOffset, type Page, type PageRequest, type SortRequest, type TransactionContext } from '@kora/core';
import type {
  ClientFilters,
  ClientListItem,
  ClientRepository,
  ClientSortableField,
  ClientStatsResult,
} from '../../domain/repositories/client.repository';
import type { Client } from '../../domain/entities/client.entity';
import type { TaxId } from '../../domain/value-objects/tax-id.vo';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';
import { toDomain, toPersistence } from './client.persistence-mapper';

@Injectable()
export class DrizzleClientRepository implements ClientRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findById(id: string, context?: TransactionContext): Promise<Client | null> {
    if (!isUuid(id)) return this.findBySlug(id, context);
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findBySlug(slug: string, context?: TransactionContext): Promise<Client | null> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(clients).where(eq(clients.slug, slug)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findByTaxId(taxId: TaxId, context?: TransactionContext): Promise<Client | null> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select()
      .from(clients)
      .where(and(eq(clients.taxId, taxId.value), isNull(clients.deletedAt)))
      .limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findByLegacyId(legacyId: number, context?: TransactionContext): Promise<Client | null> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(clients).where(eq(clients.legacyId, legacyId)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async search(
    filters: ClientFilters,
    page: PageRequest,
    sort: SortRequest<ClientSortableField>,
    context?: TransactionContext,
  ): Promise<Page<ClientListItem>> {
    const db = resolveDb(this.database, context);
    const where = this.buildWhere(filters);

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: clients.id,
          companyName: clients.companyName,
          slug: clients.slug,
          legalName: clients.legalName,
          taxId: clients.taxId,
          status: clients.status,
          commercialManagerId: clients.commercialManagerUserId,
          commercialManagerFirstName: users.firstName,
          commercialManagerLastName: users.lastName,
          primaryContactId: clients.primaryContactId,
          primaryContactName: clientContacts.name,
          primaryContactEmail: clientContacts.email,
          primaryContactPhone: clientContacts.phone,
          countryId: clients.countryId,
          countryName: countries.name,
          industryId: clients.industryId,
          industryName: industries.name,
          createdAt: clients.createdAt,
        })
        .from(clients)
        .leftJoin(users, eq(users.id, clients.commercialManagerUserId))
        .leftJoin(clientContacts, eq(clientContacts.id, clients.primaryContactId))
        .leftJoin(countries, eq(countries.id, clients.countryId))
        .leftJoin(industries, eq(industries.id, clients.industryId))
        .where(where)
        .orderBy(...this.buildOrderBy(sort))
        .limit(page.pageSize)
        .offset(toOffset(page)),

      db.select({ value: count() }).from(clients).where(where),
    ]);

    const items: ClientListItem[] = rows.map((row) => ({
      id: row.id,
      companyName: row.companyName,
      slug: row.slug,
      legalName: row.legalName,
      taxId: row.taxId,
      status: row.status,
      commercialManagerId: row.commercialManagerId,
      commercialManagerName: row.commercialManagerFirstName
        ? `${row.commercialManagerFirstName} ${row.commercialManagerLastName ?? ''}`.trim()
        : null,
      primaryContactName: row.primaryContactName,
      primaryContactEmail: row.primaryContactEmail,
      primaryContactPhone: row.primaryContactPhone,
      countryId: row.countryId,
      countryName: row.countryName,
      industryId: row.industryId,
      industryName: row.industryName,
      createdAt: row.createdAt,
    }));

    return buildPage(items, totalRows[0]?.value ?? 0, page);
  }

  async stats(context?: TransactionContext): Promise<ClientStatsResult> {
    const db = resolveDb(this.database, context);

    const [statusRows, countryRows] = await Promise.all([
      db
        .select({ status: clients.status, value: count() })
        .from(clients)
        .where(isNull(clients.deletedAt))
        .groupBy(clients.status),

      db
        .select({ country: countries.name, value: count() })
        .from(clients)
        .leftJoin(countries, eq(countries.id, clients.countryId))
        .where(isNull(clients.deletedAt))
        .groupBy(countries.name),
    ]);

    const activeCount = Number(statusRows.find((row) => row.status === 'active')?.value ?? 0);
    const inactiveCount = Number(statusRows.find((row) => row.status === 'inactive')?.value ?? 0);

    const byCountry = countryRows
      .map((row) => ({ country: row.country ?? 'Sin país', count: Number(row.value) }))
      .sort((a, b) => b.count - a.count);

    return { activeCount, inactiveCount, byCountry };
  }

  async save(client: Client, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    const values = toPersistence(client);

    await db
      .insert(clients)
      .values({ id: client.id, ...values })
      .onConflictDoUpdate({ target: clients.id, set: values });
  }

  async taxIdIsTakenByAnother(
    taxId: TaxId,
    excludingClientId: string | null,
    context?: TransactionContext,
  ): Promise<boolean> {
    const db = resolveDb(this.database, context);

    const conditions = [eq(clients.taxId, taxId.value), isNull(clients.deletedAt)];
    if (excludingClientId) conditions.push(ne(clients.id, excludingClientId));

    const rows = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(...conditions))
      .limit(1);

    return rows.length > 0;
  }

  private buildWhere(filters: ClientFilters) {
    const conditions = [];

    if (!filters.includeDeleted) conditions.push(isNull(clients.deletedAt));
    if (filters.status) conditions.push(eq(clients.status, filters.status));
    if (filters.search) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(clients.companyName, term),
          ilike(clients.legalName, term),
          ilike(clients.taxId, term),
        ),
      );
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  private buildOrderBy(sort: SortRequest<ClientSortableField>) {
    const direction = sort.direction === 'desc' ? desc : asc;
    const column = {
      companyName: clients.companyName,
      taxId: clients.taxId,
      status: clients.status,
      createdAt: clients.createdAt,
    }[sort.field];

    return [direction(column), asc(clients.id)];
  }
}
