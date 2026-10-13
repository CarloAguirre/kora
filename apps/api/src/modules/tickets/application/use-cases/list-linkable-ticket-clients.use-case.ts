import { Inject, Injectable } from '@nestjs/common';
import { ok, type ApplicationError, type Result } from '@kora/core';
import type { TicketLinkableClient } from '@kora/contracts';
import { TICKET_CLIENT_READER, type TicketClientReader } from '../ports/ticket-client-reader.port';
import type { UseCase } from '../../../../shared/application/use-case';

/**
 * Alimenta el filtro "Cliente" del tablero/historial y el selector "Cliente"
 * del modal de ticket. A propósito NO reutiliza `ListClientsUseCase`: ese
 * listado exige `clients:read` y devuelve la ficha comercial completa (RUT,
 * contacto principal, responsable comercial), pero un colaborador puede ver y
 * crear tickets sin tener acceso a la sección Clientes — mismo criterio que
 * `ListLinkableTicketProjectsUseCase`.
 */
@Injectable()
export class ListLinkableTicketClientsUseCase implements UseCase<void, TicketLinkableClient[], ApplicationError> {
  constructor(@Inject(TICKET_CLIENT_READER) private readonly clients: TicketClientReader) {}

  async execute(): Promise<Result<TicketLinkableClient[], ApplicationError>> {
    return ok(await this.clients.findLinkable());
  }
}
