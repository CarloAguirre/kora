import type { ForecastAssignmentSource, ForecastAssignmentType } from '@kora/contracts';
import { ForecastAssignment } from '../../domain/entities/forecast-assignment.entity';

export interface ForecastAssignmentRow {
  id: string;
  legacyId: number | null;
  teamMemberId: string;
  periodStart: Date;
  periodEnd: Date;
  type: string;
  projectId: string | null;
  clientId: string | null;
  comments: string;
  assignedHours: string;
  source: string;
  calculatedHours: string | null;
  adjustedAt: Date | null;
  adjustedByUserId: string | null;
  isStale: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toDomain(row: ForecastAssignmentRow): ForecastAssignment {
  return ForecastAssignment.restore({
    id: row.id,
    legacyId: row.legacyId,
    teamMemberId: row.teamMemberId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    type: row.type as ForecastAssignmentType,
    projectId: row.projectId,
    clientId: row.clientId,
    comments: row.comments,
    assignedHours: Number(row.assignedHours),
    source: row.source as ForecastAssignmentSource,
    calculatedHours: row.calculatedHours != null ? Number(row.calculatedHours) : null,
    adjustedAt: row.adjustedAt,
    adjustedByUserId: row.adjustedByUserId,
    isStale: row.isStale,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toPersistence(assignment: ForecastAssignment) {
  const snapshot = assignment.toSnapshot();
  return {
    legacyId: snapshot.legacyId,
    teamMemberId: snapshot.teamMemberId,
    periodStart: snapshot.periodStart,
    periodEnd: snapshot.periodEnd,
    type: snapshot.type,
    projectId: snapshot.projectId,
    clientId: snapshot.clientId,
    comments: snapshot.comments,
    assignedHours: String(snapshot.assignedHours),
    source: snapshot.source,
    calculatedHours: snapshot.calculatedHours != null ? String(snapshot.calculatedHours) : null,
    adjustedAt: snapshot.adjustedAt,
    adjustedByUserId: snapshot.adjustedByUserId,
    isStale: snapshot.isStale,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}
