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
    designatedApprover: item.designatedApproverUserId
      ? { id: item.designatedApproverUserId, fullName: item.designatedApproverFullName ?? '' }
      : null,
    projectApprovers: item.projectApprovers.map((approver) => ({ id: approver.id, fullName: approver.fullName })),
    createdAt: item.createdAt.toISOString(),
  };
}

export interface HourEntryDetailSource {
  readonly entry: HourEntry;
  readonly owner: HourEntryUserReference | null;
  readonly project: HourEntryProjectReference | null;
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
    team: source.team,
    assignment: snapshot.assignment,
    category: snapshot.category,
    description: snapshot.description,
    hours: snapshot.hours,
    date: snapshot.date.toISOString().slice(0, 10),
    isOvertime: snapshot.isOvertime,
    status: snapshot.status,
    rejectionReason: snapshot.rejectionReason,
    designatedApprover: snapshot.designatedApproverUserId
      ? { id: snapshot.designatedApproverUserId, fullName: source.designatedApprover?.fullName ?? '' }
      : null,
    projectApprovers: source.projectApprovers.map((approver) => ({ id: approver.id, fullName: approver.fullName })),
    projectStageAtEntry: snapshot.projectStageAtEntry,
    decisionBy: snapshot.decisionUserId ? { id: snapshot.decisionUserId, fullName: source.decisionBy?.fullName ?? '' } : null,
    decisionAt: snapshot.decisionAt?.toISOString() ?? null,
    legacyId: snapshot.legacyId,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
}
