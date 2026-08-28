import type { ForecastAssignmentType } from '@kora/contracts';
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
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}
