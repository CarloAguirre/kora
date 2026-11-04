import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  UNIT_OF_WORK,
  err,
  ok,
  type ApplicationError,
  type Clock,
  type Result,
  type UnitOfWork,
} from '@kora/core';
import type { UpdateClientInput } from '@kora/contracts';
import { TaxId } from '../../domain/value-objects/tax-id.vo';
import { ClientNotFoundError, TaxIdAlreadyInUseError } from '../../domain/errors/client.errors';
import { CLIENT_REPOSITORY, type ClientRepository } from '../../domain/repositories/client.repository';
import {
  CLIENT_CONTACT_REPOSITORY,
  type ClientContactRepository,
} from '../../domain/repositories/client-contact.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import { isUniqueViolation } from '../../../../shared/infrastructure/database/postgres-errors';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface UpdateClientCommand {
  readonly clientId: string;
  readonly data: UpdateClientInput;
  readonly actor: ActorContext;
}

/**
 * Edición de un cliente y su lista de contactos.
 *
 * Los contactos se sincronizan por diferencia: los que llegan con `id` se
 * actualizan, los que llegan sin `id` se crean, y los que existían en base
 * pero no vienen en la lista se eliminan. Es el comportamiento que espera
 * quien edita un formulario con una lista editable — "esto es lo que debe
 * quedar", no una secuencia de altas y bajas que hay que orquestar a mano.
 */
@Injectable()
export class UpdateClientUseCase implements UseCase<UpdateClientCommand, void, ApplicationError> {
  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clients: ClientRepository,
    @Inject(CLIENT_CONTACT_REPOSITORY) private readonly contacts: ClientContactRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateClientCommand): Promise<Result<void, ApplicationError>> {
    const { clientId, data, actor } = command;

    const client = await this.clients.findById(clientId);
    if (!client || client.isDeleted) return err(new ClientNotFoundError(clientId));

    const now = this.clock.now();
    let taxId = client.taxId;

    if (data.taxId !== undefined) {
      const taxIdResult = TaxId.create(data.taxId);
      if (taxIdResult.isErr()) return err(taxIdResult.error);
      taxId = taxIdResult.value;

      if (
        !taxId.equals(client.taxId) &&
        (await this.clients.taxIdIsTakenByAnother(taxId, client.id))
      ) {
        return err(new TaxIdAlreadyInUseError(taxId.value));
      }
    }

    client.updateDetails(
      {
        ...(data.companyName !== undefined ? { companyName: data.companyName } : {}),
        ...(data.legalName !== undefined ? { legalName: data.legalName } : {}),
        taxId,
        ...(data.website !== undefined ? { website: data.website || null } : {}),
        ...(data.address !== undefined ? { address: data.address || null } : {}),
        ...(data.logoDataUrl !== undefined ? { logoDataUrl: data.logoDataUrl } : {}),
        ...(data.countryId !== undefined ? { countryId: data.countryId } : {}),
        ...(data.comunaId !== undefined ? { comunaId: data.comunaId } : {}),
        ...(data.industryId !== undefined ? { industryId: data.industryId } : {}),
        ...(data.businessSectorId !== undefined ? { businessSectorId: data.businessSectorId } : {}),
        ...(data.commercialManagerUserId !== undefined
          ? { commercialManagerUserId: data.commercialManagerUserId }
          : {}),
        ...(data.serviceStartDate !== undefined
          ? { serviceStartDate: data.serviceStartDate ? new Date(data.serviceStartDate) : null }
          : {}),
      },
      now,
    );

    try {
      await this.unitOfWork.run(async (tx) => {
        if (data.contacts !== undefined) {
          const keptIds: string[] = [];

          for (const contact of data.contacts) {
            const contactId = await this.contacts.upsert(
              {
                id: contact.id,
                clientId: client.id,
                name: contact.name,
                position: contact.position || null,
                email: contact.email || null,
                phone: contact.phone || null,
              },
              tx,
            );
            keptIds.push(contactId);
          }

          await this.contacts.deleteForClientExcept(client.id, keptIds, tx);

          // Si el contacto principal fue eliminado, el primero que quede pasa
          // a serlo. Un cliente con contactos nunca debe quedar sin uno
          // principal mientras tenga al menos uno disponible.
          if (client.primaryContactId && !keptIds.includes(client.primaryContactId)) {
            client.setPrimaryContact(keptIds[0] ?? null, now);
          } else if (!client.primaryContactId && keptIds[0]) {
            client.setPrimaryContact(keptIds[0], now);
          }
        }

        await this.clients.save(client, tx);
      });
    } catch (error) {
      if (isUniqueViolation(error)) return err(new TaxIdAlreadyInUseError(taxId.value));
      throw error;
    }

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'update',
      entityType: 'client',
      entityId: client.id,
    });

    return ok(undefined);
  }
}
