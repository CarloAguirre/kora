import { Inject, Injectable } from '@nestjs/common';
import type { ForecastAssignment } from '../../domain/entities/forecast-assignment.entity';
import { FORECAST_CLIENT_READER, type ForecastClientReader } from '../ports/forecast-client-reader.port';
import { FORECAST_PROJECT_READER, type ForecastProjectReader } from '../ports/forecast-project-reader.port';
import type { ForecastTeamMemberReference } from '../ports/forecast-team-reader.port';
import { AUDIT_RECORDER, type AuditAction, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext } from '../../../../shared/application/use-case';

/**
 * Deja un cambio de una asignación en `audit_log` con la metadata que lee "Ver historial"
 * (`ListForecastHistoryUseCase`): equipo + período para filtrar, y nombres ya resueltos.
 */
@Injectable()
export class ForecastAssignmentHistory {
  constructor(
    @Inject(FORECAST_PROJECT_READER) private readonly projects: ForecastProjectReader,
    @Inject(FORECAST_CLIENT_READER) private readonly clients: ForecastClientReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async record(
    action: AuditAction,
    assignment: ForecastAssignment,
    member: ForecastTeamMemberReference,
    actor: ActorContext,
    comments: string = assignment.comments,
  ): Promise<void> {
    const [project, client] = await Promise.all([
      assignment.projectId ? this.projects.findById(assignment.projectId) : Promise.resolve(null),
      assignment.clientId ? this.clients.findById(assignment.clientId) : Promise.resolve(null),
    ]);

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action,
      entityType: 'forecast_assignment',
      entityId: assignment.id,
      metadata: {
        teamId: member.teamId,
        teamName: member.teamName,
        periodStart: assignment.periodStart.toISOString().slice(0, 10),
        periodEnd: assignment.periodEnd.toISOString().slice(0, 10),
        memberFullName: member.fullName,
        type: assignment.type,
        projectName: project?.name ?? null,
        clientName: client?.companyName ?? null,
        assignedHours: action === 'delete' ? null : assignment.assignedHours,
        comments,
      },
    });
  }
}
