import type { CatalogOption, ClientContact, ClientDetail, ClientSummary } from '@kora/contracts';
import type { Client } from '../../domain/entities/client.entity';
import type { ClientListItem } from '../../domain/repositories/client.repository';
import type { ClientContactRecord } from '../../domain/repositories/client-contact.repository';
import type { CatalogEntry } from '../ports/catalog-reader.port';

export function toClientSummary(item: ClientListItem): ClientSummary {
  return {
    id: item.id,
    companyName: item.companyName,
    legalName: item.legalName,
    taxId: item.taxId,
    status: item.status,
    commercialManager: item.commercialManagerId
      ? { id: item.commercialManagerId, fullName: item.commercialManagerName ?? '' }
      : null,
    primaryContactName: item.primaryContactName,
    primaryContactEmail: item.primaryContactEmail,
    primaryContactPhone: item.primaryContactPhone,
    country: item.countryId ? { id: item.countryId, name: item.countryName ?? '' } : null,
    industry: item.industryId ? { id: item.industryId, name: item.industryName ?? '' } : null,
    createdAt: item.createdAt.toISOString(),
  };
}

function toCatalogOption(entry: CatalogEntry | null): CatalogOption | null {
  return entry ? { id: entry.id, name: entry.name } : null;
}

export interface ClientDetailSource {
  readonly client: Client;
  readonly commercialManagerName: string | null;
  readonly country: CatalogEntry | null;
  readonly comuna: CatalogEntry | null;
  readonly industry: CatalogEntry | null;
  readonly businessSector: CatalogEntry | null;
  readonly contacts: readonly ClientContactRecord[];
  readonly primaryContactName: string | null;
  readonly primaryContactEmail: string | null;
  readonly primaryContactPhone: string | null;
}

export function toClientDetail(source: ClientDetailSource): ClientDetail {
  const snapshot = source.client.toSnapshot();

  const contacts: ClientContact[] = source.contacts.map((contact) => ({
    id: contact.id,
    name: contact.name,
    position: contact.position,
    email: contact.email,
    phone: contact.phone,
  }));

  return {
    id: snapshot.id,
    companyName: snapshot.companyName,
    legalName: snapshot.legalName,
    taxId: snapshot.taxId.value,
    status: snapshot.status,
    commercialManager: snapshot.commercialManagerUserId
      ? { id: snapshot.commercialManagerUserId, fullName: source.commercialManagerName ?? '' }
      : null,
    primaryContactName: source.primaryContactName,
    primaryContactEmail: source.primaryContactEmail,
    primaryContactPhone: source.primaryContactPhone,
    website: snapshot.website,
    address: snapshot.address,
    country: toCatalogOption(source.country),
    comuna: toCatalogOption(source.comuna),
    industry: toCatalogOption(source.industry),
    businessSector: toCatalogOption(source.businessSector),
    serviceStartDate: snapshot.serviceStartDate?.toISOString().slice(0, 10) ?? null,
    serviceEndDate: snapshot.serviceEndDate?.toISOString().slice(0, 10) ?? null,
    contacts,
    legacyId: snapshot.legacyId,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
}
