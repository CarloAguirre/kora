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
 * Contrato de equipos.
 *
 * `weeklyHours` es la base del cálculo de disponibilidad que usará el
 * forecast (M6): cuánta capacidad semanal tiene comprometida cada persona.
 */

export const teamMemberSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  fullName: z.string(),
  position: z.string().nullable(),
  weeklyHours: z.number(),
  joinedAt: isoDateTimeSchema,
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const teamSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  leader: z.object({ id: uuidSchema, fullName: z.string() }).nullable(),
  memberCount: z.number().int(),
  createdAt: isoDateTimeSchema,
});
export type TeamSummary = z.infer<typeof teamSummarySchema>;

export const teamDetailSchema = teamSummarySchema.extend({
  members: z.array(teamMemberSchema),
  legacyId: z.number().int().nullable(),
  updatedAt: isoDateTimeSchema,
});
export type TeamDetail = z.infer<typeof teamDetailSchema>;

export const createTeamSchema = z.object({
  name: nonEmptyTrimmed(120, 'El nombre del equipo'),
  description: z.string().trim().max(500).optional(),
  leaderUserId: uuidSchema.nullish(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = createTeamSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export const addTeamMemberSchema = z.object({
  userId: uuidSchema,
  position: z.string().trim().max(120).optional(),
  weeklyHours: z.coerce.number().min(0).max(80).default(44),
});
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;

export const updateTeamMemberSchema = z.object({
  position: z.string().trim().max(120).optional(),
  weeklyHours: z.coerce.number().min(0).max(80).optional(),
});
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;

/**
 * Miembro activo de CUALQUIER equipo, con el nombre de su equipo — usado por
 * el buscador de personas al asignar a un proyecto (que no está acotado a un
 * equipo en particular, a diferencia de `teamDetailSchema.members`).
 */
export const teamMemberOptionSchema = z.object({
  id: uuidSchema,
  fullName: z.string(),
  teamId: uuidSchema,
  teamName: z.string(),
});
export type TeamMemberOption = z.infer<typeof teamMemberOptionSchema>;

export const listTeamMemberOptionsResponseSchema = z.object({
  items: z.array(teamMemberOptionSchema),
});
export type ListTeamMemberOptionsResponse = z.infer<typeof listTeamMemberOptionsResponseSchema>;

export const teamSortFieldSchema = z.enum(['name', 'memberCount', 'createdAt']);
export type TeamSortField = z.infer<typeof teamSortFieldSchema>;

export const listTeamsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  isActive: z.stringbool().optional(),
  /** Equipos liderados por este usuario — usado por el selector de equipo del forecast (M6). */
  leaderUserId: uuidSchema.optional(),
  sortField: teamSortFieldSchema.default('name'),
  sortDirection: sortDirectionSchema.default('asc'),
});
export type ListTeamsQuery = z.infer<typeof listTeamsQuerySchema>;

export const listTeamsResponseSchema = pageSchema(teamSummarySchema);
export type ListTeamsResponse = z.infer<typeof listTeamsResponseSchema>;

/**
 * Disponibilidad real del equipo: horas aprobadas por colaborador y día en un
 * rango — equivalente al heatmap "Disponibilidad" de `LiderEquipos` (v1).
 * A diferencia del forecast (M6), que es capacidad planificada a futuro, esto
 * refleja horas ya trabajadas y aprobadas.
 */
export const teamAvailabilityQuerySchema = z.object({
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
});
export type TeamAvailabilityQuery = z.infer<typeof teamAvailabilityQuerySchema>;

export const teamAvailabilityDaySchema = z.object({
  date: z.string(),
  hours: z.number(),
});
export type TeamAvailabilityDay = z.infer<typeof teamAvailabilityDaySchema>;

export const teamAvailabilityMemberSchema = z.object({
  teamMemberId: uuidSchema,
  fullName: z.string(),
  weeklyHours: z.number(),
  days: z.array(teamAvailabilityDaySchema),
});
export type TeamAvailabilityMember = z.infer<typeof teamAvailabilityMemberSchema>;

export const teamAvailabilityResponseSchema = z.object({
  teamId: uuidSchema,
  members: z.array(teamAvailabilityMemberSchema),
});
export type TeamAvailabilityResponse = z.infer<typeof teamAvailabilityResponseSchema>;
