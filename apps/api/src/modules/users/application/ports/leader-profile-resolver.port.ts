import type { LeaderProfile } from '@kora/contracts';

/**
 * Deriva el perfil de un líder a partir de sus asignaciones reales.
 *
 * No es un dato editable ni un rol: un líder es "PM" si tiene proyectos
 * activos a cargo, "de equipo" si lidera equipos, y ambos si las dos cosas. La
 * v1 ya lo calculaba así (`useLiderProfile`), pero en el navegador y con dos
 * consultas por cada render; aquí se resuelve en el servidor y en lote.
 */
export interface LeaderProfileResolver {
  resolve(userId: string): Promise<LeaderProfile | null>;
  resolveMany(userIds: readonly string[]): Promise<Map<string, LeaderProfile | null>>;
}

export const LEADER_PROFILE_RESOLVER = Symbol('LeaderProfileResolver');
