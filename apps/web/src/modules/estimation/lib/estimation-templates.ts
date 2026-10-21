import type { EstimationCreationMode, EstimationPocRole } from '@kora/contracts';

const STANDARD_TEMPLATE: readonly EstimationPocRole[] = [
  { role: 'Desarrollador', unit: 'week', duration: 0, hoursPerUnit: 40, people: 1, totalHours: 0, source: null },
  { role: 'Líder', unit: 'week', duration: 0, hoursPerUnit: 15, people: 1, totalHours: 0, source: null },
  { role: 'QA', unit: 'week', duration: 0, hoursPerUnit: 40, people: 1, totalHours: 0, source: null },
  { role: 'Arquitecto', unit: 'day', duration: 0, hoursPerUnit: 8, people: 1, totalHours: 0, source: null },
  { role: 'Desarrollador IA', unit: 'week', duration: 0, hoursPerUnit: 40, people: 1, totalHours: 0, source: null },
  { role: 'PMO', unit: 'day', duration: 0, hoursPerUnit: 8, people: 1, totalHours: 0, source: null },
  { role: 'Líder IA', unit: 'week', duration: 0, hoursPerUnit: 5, people: 1, totalHours: 0, source: null },
  { role: 'Líder UX', unit: 'week', duration: 0, hoursPerUnit: 5, people: 1, totalHours: 0, source: null },
  { role: 'Diseñador UX', unit: 'day', duration: 0, hoursPerUnit: 8, people: 1, totalHours: 0, source: null },
];

const RPA_TEMPLATE: readonly EstimationPocRole[] = [
  { role: 'Desarrollador RPA', unit: 'week', duration: 0, hoursPerUnit: 40, people: 1, totalHours: 0, source: null },
  { role: 'Líder', unit: 'week', duration: 0, hoursPerUnit: 5, people: 1, totalHours: 0, source: null },
  { role: 'QA', unit: 'week', duration: 0, hoursPerUnit: 0, people: 1, totalHours: 0, source: null },
  { role: 'Arquitecto', unit: 'day', duration: 0, hoursPerUnit: 8, people: 1, totalHours: 0, source: null },
  { role: 'Desarrollador IA', unit: 'week', duration: 0, hoursPerUnit: 40, people: 1, totalHours: 0, source: null },
  { role: 'PMO', unit: 'day', duration: 0, hoursPerUnit: 8, people: 1, totalHours: 0, source: null },
  { role: 'Dev marcha blanca', unit: 'week', duration: 0, hoursPerUnit: 40, people: 1, totalHours: 0, source: null },
];

export function getManualEstimationTemplate(mode: EstimationCreationMode): readonly EstimationPocRole[] {
  if (mode === 'rpa') return RPA_TEMPLATE;
  return STANDARD_TEMPLATE;
}
