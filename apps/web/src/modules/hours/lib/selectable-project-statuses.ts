import { PROJECT_STATUSES, type ProjectStatus } from '@kora/contracts';

/**
 * Estados de proyecto que se ofrecen al registrar o editar horas: todos menos
 * Finalizado.
 */
export const HOUR_ENTRY_PROJECT_STATUSES: ProjectStatus[] = PROJECT_STATUSES.filter(
  (status) => status !== 'finished',
);
