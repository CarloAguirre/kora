import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@kora/contracts';

/** La ausencia de selección equivale a No iniciado; nunca implica Activación/Hito 0. */
export const STATUS_PLACEHOLDER = PROJECT_STATUS_LABELS.draft;
type StatusOption = { value: ProjectStatus; label: string };

/** Activo exige aprobación y, cuando es manual, se confirma el Hito 0. */
export const STATUS_OPTIONS_APPROVED: readonly StatusOption[] = [
  { value: 'active', label: 'Activo (activación manual)' },
  { value: 'on_hold', label: PROJECT_STATUS_LABELS.on_hold },
];

/** Prospecto y Cotización: pueden detenerse sin convertirse en Aprobado. */
export const STATUS_OPTIONS_NOT_APPROVED: readonly StatusOption[] = [
  { value: 'on_hold', label: PROJECT_STATUS_LABELS.on_hold },
];
