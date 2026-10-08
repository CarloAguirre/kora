import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { CloseSupportPlanInput } from '@kora/contracts';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../../projects/domain/repositories/project.repository';
import { SupportPlanNotFoundError } from '../../domain/errors/support-plan.errors';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface CloseSupportPlanCommand {
  readonly planId: string;
  readonly data: CloseSupportPlanInput;
  readonly actor: ActorContext;
}

@Injectable()
export class CloseSupportPlanUseCase implements UseCase<CloseSupportPlanCommand, void, ApplicationError> {
  constructor(
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CloseSupportPlanCommand): Promise<Result<void, ApplicationError>> {
    const { planId, data, actor } = command;
    const plan = await this.plans.findById(planId);
    if (!plan) return err(new SupportPlanNotFoundError(planId));

    const now = this.clock.now();
    const closed = plan.close(new Date(data.closedAt), data.closeReason, now);
    if (closed.isErr()) return err(closed.error);

    await this.plans.save(plan);
    await this.finishContainerProject(plan.projectId, now);
    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'status_change',
      entityType: 'support_plan',
      entityId: plan.id,
      metadata: { status: 'ended', closeReason: data.closeReason },
    });

    return ok(undefined);
  }

  /**
   * Cerrar el contrato termina su proyecto "contenedor" de soporte, para que
   * pase a "Finalizados" en Proyectos → Soporte. Salvo que otro contrato
   * activo siga usando ese mismo proyecto (legados renovados: un contrato
   * `ended` y uno `active` sobre el mismo contenedor).
   */
  private async finishContainerProject(projectId: string | null, now: Date): Promise<void> {
    if (!projectId) return;
    if (await this.plans.findActiveForProjectOrLinked(projectId)) return;
    const project = await this.projects.findById(projectId);
    if (!project || project.isDeleted || project.type !== 'support' || project.status === 'finished') return;
    project.changeStatus('finished', now);
    await this.projects.save(project);
  }
}
