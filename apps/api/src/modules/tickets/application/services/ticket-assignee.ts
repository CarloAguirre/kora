import { err, ok, type ApplicationError, type Result } from '@kora/core';
import { isTicketAssignableRole } from '@kora/contracts';
import { TicketAssigneeNotAssignableError } from '../../domain/errors/ticket.errors';
import type { TicketUserReader } from '../ports/ticket-user-reader.port';

/**
 * Un ticket solo se asigna a alguien vigente. `findById` ya devuelve `null`
 * para los eliminados; aquí se descarta además a los deshabilitados. Los
 * bloqueados sí pasan: ese estado lo pone el sistema por intentos fallidos de
 * ingreso y se revierte solo, no es una baja del colaborador. Además, solo
 * líderes y colaboradores atienden tickets (`TICKET_ASSIGNABLE_ROLES`).
 *
 * Se valida únicamente cuando el responsable cambia: si no, editar el título
 * de un ticket viejo fallaría solo porque su responsable ya no está vigente.
 */
export async function ensureAssignable(
  assigneeUserId: string | null | undefined,
  users: TicketUserReader,
): Promise<Result<void, ApplicationError>> {
  if (!assigneeUserId) return ok(undefined);

  const user = await users.findById(assigneeUserId);
  if (!user || user.status === 'disabled' || !isTicketAssignableRole(user.role)) return err(new TicketAssigneeNotAssignableError());

  return ok(undefined);
}
