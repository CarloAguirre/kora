import type { HourEntrySummary } from '@kora/contracts';

/**
 * Quién debe aprobar el registro — no siempre quien está mirando la
 * pantalla (p.ej. un PMO viendo la cola de varios equipos). En la práctica
 * `projectApprovers` trae como mucho una persona (ver hour-entry.contract.ts).
 */
export function resolvedApprover(entry: HourEntrySummary): HourEntrySummary['designatedApprover'] {
  return entry.designatedApprover ?? entry.projectApprovers[0] ?? null;
}
