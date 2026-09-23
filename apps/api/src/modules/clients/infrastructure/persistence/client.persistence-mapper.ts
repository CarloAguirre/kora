import type { ClientStatus } from '@kora/contracts';
import { Client } from '../../domain/entities/client.entity';
import { TaxId } from '../../domain/value-objects/tax-id.vo';

export interface ClientRow {
  id: string;
  legacyId: number | null;
  companyName: string;
  slug: string;
  legalName: string;
  taxId: string;
  website: string | null;
  address: string | null;
  countryId: string | null;
  comunaId: string | null;
  industryId: string | null;
  businessSectorId: string | null;
  commercialManagerUserId: string | null;
  primaryContactId: string | null;
  status: string;
  serviceStartDate: Date | null;
  serviceEndDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export function toDomain(row: ClientRow): Client {
  const taxId = TaxId.create(row.taxId).unwrap();

  return Client.restore({
    id: row.id,
    companyName: row.companyName,
    slug: row.slug,
    legalName: row.legalName,
    taxId,
    website: row.website,
    address: row.address,
    countryId: row.countryId,
    comunaId: row.comunaId,
    industryId: row.industryId,
    businessSectorId: row.businessSectorId,
    commercialManagerUserId: row.commercialManagerUserId,
    primaryContactId: row.primaryContactId,
    status: row.status as ClientStatus,
    serviceStartDate: row.serviceStartDate,
    serviceEndDate: row.serviceEndDate,
    legacyId: row.legacyId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  });
}

export function toPersistence(client: Client) {
  const snapshot = client.toSnapshot();
  return {
    companyName: snapshot.companyName,
    slug: snapshot.slug,
    legalName: snapshot.legalName,
    taxId: snapshot.taxId.value,
    website: snapshot.website,
    address: snapshot.address,
    countryId: snapshot.countryId,
    comunaId: snapshot.comunaId,
    industryId: snapshot.industryId,
    businessSectorId: snapshot.businessSectorId,
    commercialManagerUserId: snapshot.commercialManagerUserId,
    primaryContactId: snapshot.primaryContactId,
    status: snapshot.status,
    serviceStartDate: snapshot.serviceStartDate,
    serviceEndDate: snapshot.serviceEndDate,
    legacyId: snapshot.legacyId,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    deletedAt: snapshot.deletedAt,
  };
}
