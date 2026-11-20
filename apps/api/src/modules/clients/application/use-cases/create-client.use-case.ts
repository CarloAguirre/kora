import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  ID_GENERATOR,
  UNIT_OF_WORK,
  err,
  ok,
  type ApplicationError,
  type Clock,
  type IdGenerator,
  type Result,
  type UnitOfWork,
} from '@kora/core';
import { slugify, withUniqueSuffix } from '@kora/core';
import type { CreateClientInput } from '@kora/contracts';
import { Client } from '../../domain/entities/client.entity';
import { TaxId } from '../../domain/value-objects/tax-id.vo';
import { TaxIdAlreadyInUseError } from '../../domain/errors/client.errors';
import { CLIENT_REPOSITORY, type ClientRepository } from '../../domain/repositories/client.repository';
import {
  CLIENT_CONTACT_REPOSITORY,
  type ClientContactRepository,
} from '../../domain/repositories/client-contact.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';
import { isUniqueViolation } from '../../../../shared/infrastructure/database/postgres-errors';

export interface CreateClientCommand {
  readonly data: CreateClientInput;
  readonly actor: ActorContext;
}

/**
 * Alta de un cliente, con sus contactos en la misma transacción.
 *
 * El primer contacto de la lista, si lo hay, se marca como contacto principal
 * — es el comportamiento que la v1 tenía implícito (`cliente.id_contacto`
 * apuntaba siempre al primero que se cargaba) y que aquí queda explícito en el
 * código en vez de depender del orden de inserción.
 */
@Injectable()
export class CreateClientUseCase implements UseCase<CreateClientCommand, { id: string }, ApplicationError> {
  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clients: ClientRepository,
    @Inject(CLIENT_CONTACT_REPOSITORY) private readonly contacts: ClientContactRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateClientCommand): Promise<Result<{ id: string }, ApplicationError>> {
    const { data, actor } = command;

    const taxIdResult = TaxId.create(data.taxId);
    if (taxIdResult.isErr()) return err(taxIdResult.error);
    const taxId = taxIdResult.value;

    if (await this.clients.taxIdIsTakenByAnother(taxId, null)) {
      return err(new TaxIdAlreadyInUseError(taxId.value));
    }

    const slug = await withUniqueSuffix(slugify(data.companyName), async (candidate) => (await this.clients.findBySlug(candidate)) !== null);

    const now = this.clock.now();
    const client = Client.create({
      id: this.ids.generate(),
      companyName: data.companyName,
      slug,
      legalName: data.legalName,
      taxId,
      website: data.website,
      address: data.address,
      logoDataUrl: data.logoDataUrl,
      countryId: data.countryId,
      comunaId: data.comunaId,
      industryId: data.industryId,
      businessSectorId: data.businessSectorId,
      commercialManagerUserId: data.commercialManagerUserId,
      serviceStartDate: data.serviceStartDate ? new Date(data.serviceStartDate) : null,
      now,
    });

    try {
      await this.unitOfWork.run(async (tx) => {
        await this.clients.save(client, tx);

        let firstContactId: string | null = null;
        for (const contact of data.contacts) {
          const contactId = await this.contacts.upsert(
            {
              clientId: client.id,
              name: contact.name,
              position: contact.position || null,
              email: contact.email || null,
              phone: contact.phone || null,
            },
            tx,
          );
          firstContactId ??= contactId;
        }

        if (firstContactId) {
          client.setPrimaryContact(firstContactId, now);
          await this.clients.save(client, tx);
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) return err(new TaxIdAlreadyInUseError(taxId.value));
      throw error;
    }

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'create',
      entityType: 'client',
      entityId: client.id,
      metadata: { companyName: data.companyName, taxId: taxId.value },
    });

    return ok({ id: client.id });
  }
}
