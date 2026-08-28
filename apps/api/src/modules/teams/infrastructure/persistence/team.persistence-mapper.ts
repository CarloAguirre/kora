import { Team } from '../../domain/entities/team.entity';

export interface TeamRow {
  id: string;
  legacyId: number | null;
  name: string;
  description: string | null;
  leaderUserId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export function toDomain(row: TeamRow): Team {
  return Team.restore({
    id: row.id,
    name: row.name,
    description: row.description,
    leaderUserId: row.leaderUserId,
    isActive: row.isActive,
    legacyId: row.legacyId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  });
}

export function toPersistence(team: Team) {
  const snapshot = team.toSnapshot();
  return {
    name: snapshot.name,
    description: snapshot.description,
    leaderUserId: snapshot.leaderUserId,
    isActive: snapshot.isActive,
    legacyId: snapshot.legacyId,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    deletedAt: snapshot.deletedAt,
  };
}
