import { Inject, Injectable } from '@nestjs/common';
import { ok, type Result } from '@kora/core';
import { ROLE_CODES, type AvailabilityQuery, type AvailabilityResponse, type RoleCode } from '@kora/contracts';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import { USER_REPOSITORY, type UserRepository } from '../../../users/domain/repositories/user.repository';
import { PERMISSION_READER, type PermissionReader } from '../../../users/application/ports/permission-reader.port';
import type { UseCase } from '../../../../shared/application/use-case';

export interface GetHoursAvailabilityCommand {
  readonly query: AvailabilityQuery;
}

/** Suficiente para traer todos los usuarios/registros de un rango de disponibilidad (hasta ~4 semanas). */
const AVAILABILITY_PAGE_SIZE = 20_000;

const ROLE_FILTER_TO_ROLE_CODE: Record<NonNullable<AvailabilityQuery['role']>, RoleCode> = {
  admin: 'admin',
  collaborator: 'collaborator',
  leader: 'leader',
};

/**
 * "Registro de Horas" / Disponibilidad de Administración — ver la v1
 * `Usuarios/index.tsx` (pestaña `registro-horas`, líneas 799-949).
 *
 * Solo se llama con `hours:read_all` ya verificado por el controlador.
 */
@Injectable()
export class GetHoursAvailabilityUseCase implements UseCase<GetHoursAvailabilityCommand, AvailabilityResponse, never> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly hourEntries: HourEntryRepository,
    @Inject(PERMISSION_READER) private readonly permissions: PermissionReader,
  ) {}

  async execute(command: GetHoursAvailabilityCommand): Promise<Result<AvailabilityResponse, never>> {
    const { query } = command;
    const dateFrom = parseIsoDate(query.dateFrom);
    const dateTo = parseIsoDate(query.dateTo);

    const [rolePermissions, usersPage, pendingPage, approvedPage] = await Promise.all([
      Promise.all(ROLE_CODES.map(async (role) => [role, await this.permissions.forRole(role)] as const)),
      this.users.search(
        { status: 'active', teamId: query.teamId, search: query.search },
        { page: 1, pageSize: AVAILABILITY_PAGE_SIZE },
        { field: 'firstName', direction: 'asc' },
      ),
      this.hourEntries.search(
        { status: 'pending', dateFrom, dateTo, visibleToUserIds: undefined },
        { page: 1, pageSize: AVAILABILITY_PAGE_SIZE },
        { field: 'date', direction: 'asc' },
      ),
      this.hourEntries.search(
        { status: 'approved', dateFrom, dateTo, visibleToUserIds: undefined },
        { page: 1, pageSize: AVAILABILITY_PAGE_SIZE },
        { field: 'date', direction: 'asc' },
      ),
    ]);

    // Solo roles que pueden registrar horas participan de la disponibilidad — igual que
    // `canRegisterHours` en la v1, pero resuelto contra los permisos reales del rol.
    const rolesThatRegisterHours = new Set(
      rolePermissions.filter(([, perms]) => perms.includes('hours:register')).map(([role]) => role),
    );
    const requestedRole = query.role ? ROLE_FILTER_TO_ROLE_CODE[query.role] : undefined;

    const visibleUsers = usersPage.items.filter(
      (item) => rolesThatRegisterHours.has(item.role) && (!requestedRole || item.role === requestedRole),
    );
    const visibleUserIds = new Set(visibleUsers.map((item) => item.id));

    const hoursByUserAndDate: Record<string, number> = {};
    for (const entry of approvedPage.items) {
      if (!visibleUserIds.has(entry.userId)) continue;
      const key = `${entry.userId}:${toIsoDate(entry.date)}`;
      hoursByUserAndDate[key] = (hoursByUserAndDate[key] ?? 0) + entry.hours;
    }

    const registeredHoursByUserAndDate: Record<string, number> = {};
    for (const entry of [...pendingPage.items, ...approvedPage.items]) {
      if (!visibleUserIds.has(entry.userId)) continue;
      const key = `${entry.userId}:${toIsoDate(entry.date)}`;
      registeredHoursByUserAndDate[key] = (registeredHoursByUserAndDate[key] ?? 0) + entry.hours;
    }

    return ok({
      users: visibleUsers.map((item) => ({
        userId: item.id,
        fullName: `${item.firstName} ${item.lastName}`.trim(),
        email: item.email,
        role: item.role,
        teamName: item.teamName,
      })),
      hoursByUserAndDate,
      registeredHoursByUserAndDate,
    });
  }
}

function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
