import type { Page, PageRequest, SortRequest, TransactionContext } from '@kora/core';
import type { ClientStatus } from '@kora/contracts';
import type { Client } from '../entities/client.entity';
import type { TaxId } from '../value-objects/tax-id.vo';

export interface ClientFilters {
  readonly search?: string | undefined;
  readonly status?: ClientStatus | undefined;
  readonly includeDeleted?: boolean | undefined;
}

export type ClientSortableField = 'companyName' | 'taxId' | 'status' | 'createdAt';

export interface ClientListItem {
  readonly id: string;
  readonly companyName: string;
  readonly legalName: string;
  readonly taxId: string;
  readonly status: ClientStatus;
  readonly commercialManagerId: string | null;
  readonly commercialManagerName: string | null;
  readonly primaryContactName: string | null;
  readonly primaryContactEmail: string | null;
  readonly primaryContactPhone: string | null;
  readonly countryId: string | null;
  readonly countryName: string | null;
  readonly industryId: string | null;
  readonly industryName: string | null;
  readonly createdAt: Date;
}

export interface ClientCountryBreakdownItem {
  readonly country: string;
  readonly count: number;
}

export interface ClientStatsResult {
  readonly activeCount: number;
  readonly inactiveCount: number;
  readonly byCountry: readonly ClientCountryBreakdownItem[];
}

export interface ClientRepository {
  findById(id: string, context?: TransactionContext): Promise<Client | null>;
  findByTaxId(taxId: TaxId, context?: TransactionContext): Promise<Client | null>;
  findByLegacyId(legacyId: number, context?: TransactionContext): Promise<Client | null>;

  search(
    filters: ClientFilters,
    page: PageRequest,
    sort: SortRequest<ClientSortableField>,
    context?: TransactionContext,
  ): Promise<Page<ClientListItem>>;

  /** Conteos globales por estado y por país, ignorando filtros de búsqueda: alimenta las cards de estadísticas del listado. */
  stats(context?: TransactionContext): Promise<ClientStatsResult>;

  save(client: Client, context?: TransactionContext): Promise<void>;

  taxIdIsTakenByAnother(
    taxId: TaxId,
    excludingClientId: string | null,
    context?: TransactionContext,
  ): Promise<boolean>;
}

export const CLIENT_REPOSITORY = Symbol('ClientRepository');
