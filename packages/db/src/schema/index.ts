/**
 * Punto único de entrada del esquema.
 *
 * Cada módulo del sistema aporta su archivo. Drizzle Kit solo lee este índice,
 * así que agregar un módulo es agregar una línea aquí.
 */
export * from './enums';
export * from './columns';
export * from './organization';
export * from './identity';
export * from './audit';
export * from './catalogs';
export * from './clients';
export * from './projects';
export * from './hours';
export * from './tickets';
export * from './forecast';
export * from './jobs';
export * from './notifications';
