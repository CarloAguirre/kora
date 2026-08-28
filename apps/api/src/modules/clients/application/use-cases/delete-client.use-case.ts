import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, UNIT_OF_WORK, err, ok, type ApplicationError, type Clock, type Result, type UnitOfWork } from '@kora/core';
import { ClientAlreadyDeletedError, ClientNotFoundError } from '../../domain/errors/client.errors';
import { CLIENT_REPOSITORY, type ClientRepository } from '../../domain/repositories/client.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface DeleteClientCommand {
  readonly clientId: string;
  readonly actor: ActorContext;
}

/** Baja lógica de un cliente. Sus proyectos, tickets y facturación históricos siguen apuntando a él. */
@Injectable()
export class DeleteClientUseCase implements UseCase<DeleteClientCommand, void, ApplicationError> {
  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clients: ClientRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: DeleteClientCommand): Promise<Result<void, ApplicationError>> {
    const client = await this.clients.findById(command.clientId);
    if (!client) return err(new ClientNotFoundError(command.clientId));
    if (client.isDeleted) return err(new ClientAlreadyDeletedError());

    client.softDelete(this.clock.now());
    await this.unitOfWork.run((tx) => this.clients.save(client, tx));

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'delete',
      entityType: 'client',
      entityId: client.id,
      metadata: { companyName: client.companyName },
    });

    return ok(undefined);
  }
}
