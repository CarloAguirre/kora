import type { HourEntryStatus } from '@kora/contracts';
import { HourEntry } from '../../domain/entities/hour-entry.entity';

export interface HourEntryRow {
  id: string;
  legacyId: string | null;
  userId: string;
  projectId: string | null;
  moduleId: string | null;
  assignment: string | null;
  category: string;
  description: string;
  hours: string;
  date: Date;
  isOvertime: boolean;
  projectStageAtEntry: string | null;
  status: string;
  rejectionReason: string | null;
  decisionUserId: string | null;
  decisionAt: Date | null;
  designatedApproverUserId: string | null;
  hasBlocker: boolean;
  blockerDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toDomain(row: HourEntryRow): HourEntry {
  return HourEntry.restore({
    id: row.id,
    userId: row.userId,
    projectId: row.projectId,
    moduleId: row.moduleId,
    assignment: row.assignment,
    category: row.category,
    description: row.description,
    hours: Number(row.hours),
    date: row.date,
    isOvertime: row.isOvertime,
    projectStageAtEntry: row.projectStageAtEntry,
    status: row.status as HourEntryStatus,
    rejectionReason: row.rejectionReason,
    decisionUserId: row.decisionUserId,
    decisionAt: row.decisionAt,
    designatedApproverUserId: row.designatedApproverUserId,
    hasBlocker: row.hasBlocker,
    blockerDescription: row.blockerDescription,
    legacyId: row.legacyId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toPersistence(entry: HourEntry) {
  const snapshot = entry.toSnapshot();
  return {
    userId: snapshot.userId,
    projectId: snapshot.projectId,
    moduleId: snapshot.moduleId,
    assignment: snapshot.assignment,
    category: snapshot.category,
    description: snapshot.description,
    hours: String(snapshot.hours),
    date: snapshot.date,
    isOvertime: snapshot.isOvertime,
    projectStageAtEntry: snapshot.projectStageAtEntry,
    status: snapshot.status,
    rejectionReason: snapshot.rejectionReason,
    decisionUserId: snapshot.decisionUserId,
    decisionAt: snapshot.decisionAt,
    designatedApproverUserId: snapshot.designatedApproverUserId,
    hasBlocker: snapshot.hasBlocker,
    blockerDescription: snapshot.blockerDescription,
    legacyId: snapshot.legacyId,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}
