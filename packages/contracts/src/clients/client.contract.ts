import { z } from 'zod';
import {
  isoDateTimeSchema,
  nonEmptyTrimmed,
  pageSchema,
  paginationQuerySchema,
  sortDirectionSchema,
  uuidSchema,
} from '../common/primitives';

/**
 * Contrato de clientes.
 *
 * `Inactivo` en la v1 finalizaba en cascada los proyectos del cliente vía un
 * trigger silencioso. En la v2 ese efecto es una confirmación explícita en la
 * interfaz (`ChangeClientStatusInput.confirmProjectCascade`) y una decisión
 * del caso de uso, no un `TRIGGER` que nadie ve ejecutarse.
 */

export const CLIENT_STATUSES = ['active', 'inactive'] as const;
export const clientStatusSchema = z.enum(CLIENT_STATUSES);
export type ClientStatus = z.infer<typeof clientStatusSchema>;

export const CLIENT_STATUS_LABELS: Readonly<Record<ClientStatus, string>> = {
  active: 'Activo',
  inactive: 'Inactivo',
};

export const catalogOptionSchema = z.object({
  id: uuidSchema,
  name: z.string(),
});
export type CatalogOption = z.infer<typeof catalogOptionSchema>;

export const clientContactSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  position: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});
export type ClientContact = z.infer<typeof clientContactSchema>;

export const clientSummarySchema = z.object({
  id: uuidSchema,
  companyName: z.string(),
  legalName: z.string(),
  taxId: z.string(),
  status: clientStatusSchema,
  commercialManager: z.object({ id: uuidSchema, fullName: z.string() }).nullable(),
  primaryContactName: z.string().nullable(),
  primaryContactEmail: z.string().nullable(),
  primaryContactPhone: z.string().nullable(),
  country: catalogOptionSchema.nullable(),
  industry: catalogOptionSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type ClientSummary = z.infer<typeof clientSummarySchema>;

export const clientsCountryBreakdownSchema = z.object({
  country: z.string(),
  count: z.number().int(),
});
export type ClientsCountryBreakdown = z.infer<typeof clientsCountryBreakdownSchema>;

/** Estadísticas agregadas de cartera, para las cards del listado. Ignoran los filtros de búsqueda vigentes: los totales por país y por estado son globales, igual que en la v1. */
export const clientsStatsSchema = z.object({
  activeCount: z.number().int(),
  inactiveCount: z.number().int(),
  totalCount: z.number().int(),
  byCountry: z.array(clientsCountryBreakdownSchema),
});
export type ClientsStats = z.infer<typeof clientsStatsSchema>;

export const clientDetailSchema = clientSummarySchema.extend({
  website: z.string().nullable(),
  address: z.string().nullable(),
  country: catalogOptionSchema.nullable(),
  comuna: catalogOptionSchema.nullable(),
  industry: catalogOptionSchema.nullable(),
  businessSector: catalogOptionSchema.nullable(),
  serviceStartDate: z.string().nullable(),
  serviceEndDate: z.string().nullable(),
  contacts: z.array(clientContactSchema),
  legacyId: z.number().int().nullable(),
  updatedAt: isoDateTimeSchema,
});
export type ClientDetail = z.infer<typeof clientDetailSchema>;

export const clientContactInputSchema = z.object({
  id: uuidSchema.optional(),
  name: nonEmptyTrimmed(200, 'El nombre del contacto'),
  position: z.string().trim().max(200).optional(),
  email: z.email('Correo inválido.').optional().or(z.literal('')),
  phone: z.string().trim().max(50).optional(),
});
export type ClientContactInput = z.infer<typeof clientContactInputSchema>;

export const createClientSchema = z.object({
  companyName: nonEmptyTrimmed(200, 'El nombre de la empresa'),
  legalName: nonEmptyTrimmed(200, 'La razón social'),
  taxId: nonEmptyTrimmed(50, 'El RUT'),
  website: z.string().trim().max(255).optional(),
  address: z.string().trim().max(300).optional(),
  countryId: uuidSchema.nullish(),
  comunaId: uuidSchema.nullish(),
  industryId: uuidSchema.nullish(),
  businessSectorId: uuidSchema.nullish(),
  commercialManagerUserId: uuidSchema.nullish(),
  serviceStartDate: z.iso.date().nullish(),
  contacts: z.array(clientContactInputSchema).default([]),
});
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = createClientSchema.partial().extend({
  contacts: z.array(clientContactInputSchema).optional(),
});
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export const changeClientStatusSchema = z.object({
  status: clientStatusSchema,
  /** El usuario confirma explícitamente que sabe que sus proyectos activos se finalizarán. */
  confirmProjectCascade: z.boolean().default(false),
});
export type ChangeClientStatusInput = z.infer<typeof changeClientStatusSchema>;

export const clientSortFieldSchema = z.enum(['companyName', 'taxId', 'status', 'createdAt']);
export type ClientSortField = z.infer<typeof clientSortFieldSchema>;

export const listClientsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  status: clientStatusSchema.optional(),
  sortField: clientSortFieldSchema.default('companyName'),
  sortDirection: sortDirectionSchema.default('asc'),
});
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;

export const listClientsResponseSchema = pageSchema(clientSummarySchema);
export type ListClientsResponse = z.infer<typeof listClientsResponseSchema>;
