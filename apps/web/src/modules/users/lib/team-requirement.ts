import type { RoleCode } from '@kora/contracts';

/**
 * Qué roles llevan equipo.
 *
 * Es un ESPEJO de `TeamAssignmentPolicy` del backend, mantenido a propósito
 * para que el formulario reaccione al instante sin ir al servidor. La regla
 * autoritativa sigue siendo la del backend: si ambas discreparan, gana el
 * servidor y el formulario recibe el error.
 *
 * Duplicar una regla siempre es un riesgo. Se acepta aquí porque es una regla
 * de tres líneas que cambia muy rara vez, y a cambio evita que el selector de
 * equipo parpadee esperando una respuesta. Reglas más complejas o más
 * cambiantes NO deben duplicarse: se consultan al servidor.
 */
export type TeamRequirement = 'required' | 'optional' | 'forbidden';

const REQUIREMENT_BY_ROLE: Readonly<Record<RoleCode, TeamRequirement>> = {
  admin: 'forbidden',
  pmo: 'forbidden',
  leader: 'optional',
  collaborator: 'required',
  commercial: 'forbidden',
  finanzas: 'forbidden',
  cliente: 'forbidden',
};

export function teamRequirementFor(role: RoleCode): TeamRequirement {
  return REQUIREMENT_BY_ROLE[role];
}
