import type { HourEntrySummary } from '@kora/contracts';

/** El backend resuelve el aprobador real según el tipo de proyecto. */
export function resolvedApprover(entry: HourEntrySummary): HourEntrySummary['designatedApprover'] {
  return entry.project
    ? entry.projectApprovers[0] ?? null
    : entry.designatedApprover ?? null;
}

/**
 * Restricción defensiva de acciones en el frontend. El backend siempre vuelve
 * a comprobar la autorización en HourEntryApprovalAuthorityService.
 * En horas sin proyecto, el llamador debe consumir el listado acotado al actor.
 */
export function canDecideHourEntry(
  entry: HourEntrySummary,
  actor: { id: string; role: string } | null | undefined,
  hasApprovePermission: boolean,
): boolean {
  if (!actor || !hasApprovePermission) return false;
  if (actor.role === 'admin' || actor.role === 'pmo') return true;
  if (entry.project) return entry.projectApprovers.some((approver) => approver.id === actor.id);
  return entry.designatedApprover?.id === actor.id || entry.user.id !== actor.id;
}
