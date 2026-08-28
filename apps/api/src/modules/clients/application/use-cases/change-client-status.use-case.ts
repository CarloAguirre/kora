import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, UNIT_OF_WORK, err, ok, type ApplicationError, type Clock, type Result, type UnitOfWork } from '@kora/core';
import type { ChangeClientStatusInput } from '@kora/contracts';
import {
  ClientDeactivationRequiresConfirmationError,
  ClientNotFoundError,
} from '../../domain/errors/client.errors';
import { CLIENT_REPOSITORY, type ClientRepository } from '../../domain/repositories/client.repository';
import {
  PROJECT_ACTIVITY_READER,
  type ProjectActivityReader,
} from '../ports/project-activity-reader.port';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface ChangeClientStatusCommand {
  readonly clientId: string;
  readonly data: ChangeClientStatusInput;
  readonly actor: ActorContext;
}

/**
 * Activa o desactiva un cliente.
 *
 * La v1 finalizaba los proyectos del cliente en silencio, dentro de un trigger
 * (`trg_finalize_projects_when_client_inactive`) que nadie veía ejecutarse
 * desde la interfaz. Aquí, si el cliente tiene proyectos activos, la
 * desactivación se RECHAZA hasta que el llamador confirme explícitamente
 * (`confirmProjectCascade: true`) — la interfaz debe mostrar cuántos proyectos
 * se verán afectados antes de pedir esa confirmación.
 *
 * `ProjectActivityReader` hoy responde siempre cero porque el módulo de
 * proyectos (M3) no existe todavía: hasta que llegue, desactivar un cliente
 * nunca pide confirmación. En cuanto M3 aporte su implementación real del
 * puerto, este caso de uso empieza a exigirla sin que cambie una línea aquí.
 */
@Injectable()
export class ChangeClientStatusUseCase
  implements UseCase<ChangeClientStatusCommand, { affectedProjects: number }, ApplicationError>
{
  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clients: ClientRepository,
    @Inject(PROJECT_ACTIVITY_READER) private readonly projectActivity: ProjectActivityReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    command: ChangeClientStatusCommand,
  ): Promise<Result<{ affectedProjects: number }, ApplicationError>> {
    const { clientId, data, actor } = command;

    const client = await this.clients.findById(clientId);
    if (!client || client.isDeleted) return err(new ClientNotFoundError(clientId));

    if (client.status === data.status) return ok({ affectedProjects: 0 });

    const previousStatus = client.status;
    const now = this.clock.now();
    let affectedProjects = 0;

    if (data.status === 'inactive') {
      affectedProjects = await this.projectActivity.countActiveProjectsForClient(client.id);

      if (affectedProjects > 0 && !data.confirmProjectCascade) {
        return err(new ClientDeactivationRequiresConfirmationError(affectedProjects));
      }

      client.deactivate(now);
    } else {
      client.activate(now);
    }

    await this.unitOfWork.run((tx) => this.clients.save(client, tx));

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'status_change',
      entityType: 'client',
      entityId: client.id,
      changes: { status: { before: previousStatus, after: data.status } },
      ...(affectedProjects > 0 ? { metadata: { affectedProjects } } : {}),
    });

    return ok({ affectedProjects });
  }
}
