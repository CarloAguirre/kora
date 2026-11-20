import type { ClientProjectDetail } from '../types';

/** Campos públicos de impacto que exponen tanto el detalle interno de proyectos
 * como la proyección autorizada del portal externo. */
export type BusinessImpactFields = {
  impactBeforeHours: number | null;
  impactBeforePeople: string | null;
  impactBeforeDuration: string | null;
  impactBeforeModality: string | null;
  impactAfterHours: number | null;
  impactAfterPeople: string | null;
  impactAfterDuration: string | null;
  impactAfterModality: string | null;
};

export type ClientBusinessImpact = ClientProjectDetail['businessImpact'];

/** Única transformación para PMO/Vista Cliente y el portal externo.
 * Conserva el comportamiento histórico de la vista interna: cuando falta
 * información se muestran 0 y modalidad vacía, sin ocultar la sección. */
export function toClientBusinessImpact(fields: BusinessImpactFields): ClientBusinessImpact {
  const parseLeadingNumber = (value: string | null): number => {
    const match = value?.match(/\d+(?:[.,]\d+)?/);
    return match ? Number(match[0].replace(',', '.')) : 0;
  };

  const before = {
    totalProcessHours: fields.impactBeforeHours ?? 0,
    peopleInvolved: parseLeadingNumber(fields.impactBeforePeople),
    cycleDays: parseLeadingNumber(fields.impactBeforeDuration),
    modality: fields.impactBeforeModality ?? '',
  };
  const after = {
    totalProcessHours: fields.impactAfterHours ?? 0,
    peopleInvolved: parseLeadingNumber(fields.impactAfterPeople),
    cycleDays: parseLeadingNumber(fields.impactAfterDuration),
    modality: fields.impactAfterModality ?? '',
  };
  const reductionPercent = before.totalProcessHours > 0
    ? Math.round((1 - after.totalProcessHours / before.totalProcessHours) * 100)
    : 0;

  return { before, after, reductionPercent };
}
