/**
 * Sonda de estado de las dependencias externas.
 *
 * El controlador de salud pregunta "¿responde la base?" sin saber qué es una
 * base: si mañana hay que comprobar también una cola o un almacén de archivos,
 * se añade una implementación más de este puerto y el controlador no cambia.
 */
export interface HealthProbe {
  /** Nombre de la dependencia comprobada, para el informe. */
  readonly name: string;
  check(): Promise<boolean>;
}

export const HEALTH_PROBES = Symbol('HealthProbes');
