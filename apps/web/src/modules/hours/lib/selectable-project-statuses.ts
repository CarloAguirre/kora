import type { ProjectStatus } from '@kora/contracts';

/**
 * Estados de proyecto que se ofrecen al registrar o editar horas: No iniciado
 * y Activo. Detenido, Finalizado y Cancelado quedan fuera; el backend también
 * los rechaza (ver `CreateHourEntryUseCase`).
 */
export const HOUR_ENTRY_PROJECT_STATUSES: ProjectStatus[] = ['draft', 'active'];
