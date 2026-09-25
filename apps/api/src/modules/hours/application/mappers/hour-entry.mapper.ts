import type { HourEntryDetail, HourEntrySummary } from '@kora/contracts';
import type { HourEntry } from '../../domain/entities/hour-entry.entity';
import type { HourEntryListItem } from '../../domain/repositories/hour-entry.repository';
import type { HourEntryUserReference } from '../ports/hour-entry-user-reader.port';
import type { HourEntryProjectReference } from '../ports/hour-entry-project-reader.port';

export function toHourEntrySummary(item: HourEntryListItem): HourEntrySummary {
  return {
    id: item.id,
    user: { id: item.userId, fullName: item.userFullName },
    project: item.projectId ? { id: item.projectId, name: item.projectName ?? '' } : null,
    module: item.moduleId ? { id: item.moduleId, name: item.moduleName ?? '' } : null,
    team: item.teamId ? { id: item.teamId, name: item.teamName ?? '' } : null,
    assignment: item.assignment,
    category: item.category,
    description: item.description,
    hours: item.hours,
    date: item.date.toISOString().slice(0, 10),
    isOvertime: item.isOvertime,
    projectStageAtEntry: item.projectStageAtEntry,
    status: item.status,
    rejectionReason: item.rejectionReason,
    hasBlocker: item.hasBlocker,
    blockerDescription: item.blockerDescription,
    // Un registro CON proyecto nunca se aprueba por aprobador designado (ver
    // `DesignatedApproverNotAllowedError`) — el autorizador real siempre es
    // `projectApprovers`. Datos migrados de la v1 dejaron
    // `designated_approver_user_id` poblado igual en filas con proyecto, y
    // ese valor puede haber quedado desactualizado frente al líder vigente
    // (verificado: 9 de 52 horas pendientes con proyecto lo muestran
    // distinto del aprobador real) — se ignora aquí para que nunca se
    // muestre como "quien debe aprobar" a alguien sin autoridad real.
    designatedApprover:
      !item.projectId && item.designatedApproverUserId
        ? { id: item.designatedApproverUserId, fullName: item.designatedApproverFullName ?? '' }
        : null,
    projectApprovers: item.projectApprovers.map((approver) => ({ id: approver.id, fullName: approver.fullName })),
    ticket: item.ticket,
    createdAt: item.createdAt.toISOString(),
  };
}

export interface HourEntryDetailSource {
  readonly entry: HourEntry;
  readonly owner: HourEntryUserReference | null;
  readonly project: HourEntryProjectReference | null;
  readonly module: { id: string; name: string } | null;
  readonly designatedApprover: HourEntryUserReference | null;
  readonly decisionBy: HourEntryUserReference | null;
  readonly team: { id: string; name: string } | null;
  readonly projectApprovers: readonly { id: string; fullName: string }[];
}

export function toHourEntryDetail(source: HourEntryDetailSource): HourEntryDetail {
  const snapshot = source.entry.toSnapshot();

  return {
    id: snapshot.id,
    user: { id: snapshot.userId, fullName: source.owner?.fullName ?? '' },
    project: snapshot.projectId ? { id: snapshot.projectId, name: source.project?.name ?? '' } : null,
    module: snapshot.moduleId ? { id: snapshot.moduleId, name: source.module?.name ?? '' } : null,
    team: source.team,
    assignment: snapshot.assignment,
    category: snapshot.category,
    description: snapshot.description,
    hours: snapshot.hours,
    date: snapshot.date.toISOString().slice(0, 10),
    isOvertime: snapshot.isOvertime,
    status: snapshot.status,
    rejectionReason: snapshot.rejectionReason,
    hasBlocker: snapshot.hasBlocker,
    blockerDescription: snapshot.blockerDescription,
    // Ver nota equivalente en `toHourEntrySummary`: un registro con proyecto
    // nunca se aprueba por aprobador designado, aunque el dato migrado de la
    // v1 haya quedado poblado.
    designatedApprover:
      !snapshot.projectId && snapshot.designatedApproverUserId
        ? { id: snapshot.designatedApproverUserId, fullName: source.designatedApprover?.fullName ?? '' }
        : null,
    projectApprovers: source.projectApprovers.map((approver) => ({ id: approver.id, fullName: approver.fullName })),
    // La ficha de detalle no resuelve el origen de ticket (solo la cola de
    // aprobaciones, vía `HourEntryListItem.ticket` — `DrizzleHourEntryRepository.search`).
    ticket: null,
    projectStageAtEntry: snapshot.projectStageAtEntry,
    decisionBy: snapshot.decisionUserId ? { id: snapshot.decisionUserId, fullName: source.decisionBy?.fullName ?? '' } : null,
    decisionAt: snapshot.decisionAt?.toISOString() ?? null,
    legacyId: snapshot.legacyId,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
}
