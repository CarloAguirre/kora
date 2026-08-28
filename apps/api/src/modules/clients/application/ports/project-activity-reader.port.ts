/**
 * Cuántos proyectos activos tiene un cliente.
 *
 * El módulo de proyectos (M3) aún no existe, así que este puerto lo satisface
 * hoy un adaptador nulo que siempre responde cero — el mismo patrón que
 * `LeaderProfileResolver` usa para la parte de proyectos hasta que ese módulo
 * llegue. Cuando exista, su repositorio implementa este puerto y el caso de
 * uso de desactivación empieza a pedir confirmación de verdad, sin que este
 * archivo ni el caso de uso cambien una línea.
 */
export interface ProjectActivityReader {
  countActiveProjectsForClient(clientId: string): Promise<number>;
}

export const PROJECT_ACTIVITY_READER = Symbol('ProjectActivityReader');
