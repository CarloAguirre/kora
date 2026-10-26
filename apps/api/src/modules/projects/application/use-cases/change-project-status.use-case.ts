import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import { PROJECT_STATUS_LABELS, type ChangeProjectStatusInput, type Permission } from '@kora/contracts';
import {
  CannotManageProjectError,
  CannotActivateProjectError,
  ManualHito0ReasonRequiredError,
  ProjectNotFoundError,
  ActiveSupportContractMustBeClosedError,
  SupportContractRequiredForStatusError,
} from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import { SUPPORT_CONTRACT_STATUS_READER, type SupportContractStatusReader } from '../ports/support-contract-status-reader.port';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';
import { PaymentMilestoneTriggerService } from '../services/payment-milestone-trigger.service';
import { ProjectChangeLogRecorder } from '../services/project-change-log.recorder';

export interface ChangeProjectStatusCommand {
  readonly projectId: string;
  readonly data: ChangeProjectStatusInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

@Injectable()
export class ChangeProjectStatusUseCase
  implements UseCase<ChangeProjectStatusCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly changeLog: ProjectChangeLogRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly paymentTriggers: PaymentMilestoneTriggerService,
    @Inject(SUPPORT_CONTRACT_STATUS_READER) private readonly supportContracts: SupportContractStatusReader,
  ) {}

  async execute(command: ChangeProjectStatusCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    if (!command.actorPermissions.includes('projects:manage') && project.leaderUserId !== command.actor.userId) {
      return err(new CannotManageProjectError());
    }

    const previousStatus = project.status;
    if (previousStatus === command.data.status) return ok(undefined);

    if (project.type === 'support') {
      const statuses = await this.supportContracts.statusesForProject(project.id);
      const hasActiveContract = statuses.includes('active');
      if (command.data.status === 'finished') {
        if (hasActiveContract) return err(new ActiveSupportContractMustBeClosedError());
        if (!statuses.includes('ended')) {
          return err(new SupportContractRequiredForStatusError('Solo un soporte con contrato cerrado puede marcarse como terminado.'));
        }
      }
      if (command.data.status === 'active' && !hasActiveContract) {
        return err(new SupportContractRequiredForStatusError('Se necesita un contrato activo para activar este soporte.'));
      }
      if (previousStatus === 'finished' && !hasActiveContract) {
        return err(new SupportContractRequiredForStatusError('Se necesita un contrato activo para reabrir un soporte terminado.'));
      }
    }

    /** Pasar a Activo (sea Hito 0 manual o reactivar tras Detenido) es de Gerencia/PMO, no del líder por sí solo. */
    if (command.data.status === 'active' && !command.actorPermissions.includes('projects:manage')) {
      return err(new CannotActivateProjectError());
    }

    /**
     * Hito 0 manual (sin factura): activar a mano un proyecto `development`
     * `aprobado` que seguía "No iniciado" — con motivo/referencia obligatorio
     * (contrato firmado, OC, etc).
     */
    const isManualHito0 =
      previousStatus === 'draft' && command.data.status === 'active' && project.type === 'development' && project.salesStage === 'approved';

    const now = this.clock.now();
    let message = `Estado del proyecto cambiado de "${PROJECT_STATUS_LABELS[previousStatus]}" a "${PROJECT_STATUS_LABELS[command.data.status]}".`;
    if (isManualHito0) {
      const reason = command.data.reason?.trim();
      if (!reason) return err(new ManualHito0ReasonRequiredError());
      project.activateFromHito0(now, 'manual', reason);
      message = `Proyecto activado manualmente (Hito 0) — comienzan a correr las horas. Motivo: ${reason}`;
    } else {
      project.changeStatus(command.data.status, now);
    }
    await this.projects.save(project);

    await this.changeLog.record([{ projectId: project.id, message, isHito0: isManualHito0 }], command.actor.userId, now);

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'status_change',
      entityType: 'project',
      entityId: project.id,
      changes: { status: { before: previousStatus, after: command.data.status } },
    });

    // Finalizar cumple los tramos por fase que quedaban pendientes (ej. Marcha blanca).
    await this.paymentTriggers.promoteAndNotify(project);

    return ok(undefined);
  }
}
