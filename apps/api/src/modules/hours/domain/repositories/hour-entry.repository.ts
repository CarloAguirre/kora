import type { Page, PageRequest, SortRequest, TransactionContext } from '@kora/core';
import type { HourEntryStatus, ProjectType } from '@kora/contracts';
import type { HourEntry } from '../entities/hour-entry.entity';

export interface HourEntryFilters {
  readonly userId?: string | undefined;
  /** Filtra por nombre del autor (ilike sobre nombre/apellido). */
  readonly search?: string | undefined;
  /** Acota a autores con membresía activa en este equipo. */
  readonly teamId?: string | undefined;
  readonly projectId?: string | undefined;
  readonly status?: HourEntryStatus | undefined;
  readonly dateFrom?: Date | undefined;
  readonly dateTo?: Date | undefined;
  /** Alcance de visibilidad ya resuelto por el caso de uso (propias, del equipo, todas). */
  readonly visibleToUserIds?: readonly string[] | undefined;
}

export type HourEntrySortableField = 'date' | 'createdAt' | 'status' | 'hours';

export interface HourEntryListItem {
  readonly id: string;
  readonly userId: string;
  readonly userFullName: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  /** Equipo activo del autor al momento de listar — no es histórico, refleja la membresía actual. */
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly assignment: string | null;
  readonly category: string;
  readonly description: string;
  readonly hours: number;
  readonly date: Date;
  readonly isOvertime: boolean;
  readonly status: HourEntryStatus;
  readonly rejectionReason: string | null;
  readonly designatedApproverUserId: string | null;
  readonly designatedApproverFullName: string | null;
  /** Líder del proyecto + líder del equipo del propio autor (si está asignado al proyecto), cuando `projectId` no es null. */
  readonly projectApprovers: readonly { id: string; fullName: string }[];
  readonly createdAt: Date;
  /** Quién aprobó/rechazó el registro — alimenta el reporte de Capacity ("Responsable"). */
  readonly decisionUserId: string | null;
  readonly decisionByFullName: string | null;
  /** Cliente y tipo del proyecto asociado — alimenta el reporte de Capacity. */
  readonly clientId: string | null;
  readonly clientName: string | null;
  readonly projectType: ProjectType | null;
  readonly projectSalesStage: string | null;
}

export interface HourEntryRepository {
  findById(id: string, context?: TransactionContext): Promise<HourEntry | null>;
  findByLegacyId(legacyId: string, context?: TransactionContext): Promise<HourEntry | null>;

  search(
    filters: HourEntryFilters,
    page: PageRequest,
    sort: SortRequest<HourEntrySortableField>,
    context?: TransactionContext,
  ): Promise<Page<HourEntryListItem>>;

  save(entry: HourEntry, context?: TransactionContext): Promise<void>;

  delete(id: string, context?: TransactionContext): Promise<void>;

  /** Suma de horas aprobadas de un proyecto — alimenta `projects.used_hours`. */
  sumApprovedHoursForProject(projectId: string, context?: TransactionContext): Promise<number>;
}

export const HOUR_ENTRY_REPOSITORY = Symbol('HourEntryRepository');
