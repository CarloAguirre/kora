import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import { isAdminTier, type ForecastAssignmentType, type ForecastHistoryEntry, type RoleCode } from '@kora/contracts';
import { ForbiddenForecastAccessError } from '../../domain/errors/forecast.errors';
import { FORECAST_TEAM_READER, type ForecastTeamReader } from '../ports/forecast-team-reader.port';
import { AUDIT_READER, type AuditReader } from '../../../../shared/application/ports/audit-reader.port';
import type { UseCase } from '../../../../shared/application/use-case';

export interface ListForecastHistoryCommand {
  readonly teamId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly actorUserId: string;
  readonly actorRole: RoleCode;
}

const ACTION_LABELS: Record<string, ForecastHistoryEntry['action']> = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
};

/** Panel de historial de la v1 (`ForecastHistoryPanel`) — ver docs/DECISION-M6-FORECAST.md. */
@Injectable()
export class ListForecastHistoryUseCase implements UseCase<ListForecastHistoryCommand, ForecastHistoryEntry[], ApplicationError> {
  constructor(
    @Inject(AUDIT_READER) private readonly audit: AuditReader,
    @Inject(FORECAST_TEAM_READER) private readonly teams: ForecastTeamReader,
  ) {}

  async execute(command: ListForecastHistoryCommand): Promise<Result<ForecastHistoryEntry[], ApplicationError>> {
    const { teamId, periodStart, periodEnd, actorUserId, actorRole } = command;

    if (!isAdminTier(actorRole) && !(await this.teams.isTeamLeader(teamId, actorUserId))) {
      return err(new ForbiddenForecastAccessError());
    }

    const entries = await this.audit.list({
      entityType: 'forecast_assignment',
      metadataEquals: { teamId, periodStart, periodEnd },
      limit: 100,
    });

    return ok(
      entries.map((entry) => {
        const metadata = entry.metadata ?? {};
        return {
          id: entry.id,
          action: ACTION_LABELS[entry.action] ?? 'updated',
          memberFullName: (metadata.memberFullName as string | undefined) ?? null,
          teamName: (metadata.teamName as string | undefined) ?? null,
          periodStart: (metadata.periodStart as string | undefined) ?? null,
          periodEnd: (metadata.periodEnd as string | undefined) ?? null,
          type: (metadata.type as ForecastAssignmentType | undefined) ?? null,
          projectName: (metadata.projectName as string | undefined) ?? null,
          clientName: (metadata.clientName as string | undefined) ?? null,
          assignedHours: (metadata.assignedHours as number | undefined) ?? null,
          comments: (metadata.comments as string | undefined) ?? null,
          actorName: entry.actorName ?? (metadata.actorName as string | undefined) ?? null,
          occurredAt: entry.occurredAt.toISOString(),
        };
      }),
    );
  }
}
