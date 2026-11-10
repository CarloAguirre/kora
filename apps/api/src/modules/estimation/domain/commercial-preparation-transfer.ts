/** Solo autoriza una excepción al traspaso inicial cuando todo el historial
 * horario anterior es de preparación comercial. No clasificar por la etapa
 * histórica 'Activo': la v1 la guardó así incluso en Prospecto. */
export type CommercialHourEntry = {
  assignment: string | null;
  moduleId: string | null;
  status: 'pending' | 'approved' | 'rejected';
  hours: string | number;
};
const normalize = (name: string) => name.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es-CL');

export function hasOnlyCommercialPreparationHours(
  entries: readonly CommercialHourEntry[],
  usedHours: number,
): boolean {
  if (!entries.length || !Number.isFinite(usedHours) || usedHours < 0) return false;
  // Durante la prospección no siempre se clasificaban las horas por tarea:
  // NULL y las etiquetas comerciales explícitas corresponden a Fase 1
  // solo cuando tampoco hay módulo operativo (ver guarda transaccional).
  const commercial = new Set([
    '', 'prospecto', 'prospeccion', 'cotizacion', 'preventa', 'fase 1',
    'fase 1 prospecto cotizacion',
  ]);
  if (!entries.every((entry) => entry.moduleId === null &&
    commercial.has(normalize(entry.assignment ?? '')) &&
    Number.isFinite(Number(entry.hours)) && Number(entry.hours) >= 0)) return false;
  // Pendientes/rechazadas se conservan, pero nunca son HH consumidas.
  // Solo las aprobadas deben conciliar con projects.usedHours.
  const total = entries.filter((entry) => entry.status === 'approved')
    .reduce((sum, entry) => sum + Number(entry.hours), 0);
  return Number.isFinite(total) && Math.abs(total - usedHours) <= 0.01;
}


export type ExistingProspectTeam = {
  teamId: string;
  assignedHours: number | string | null;
};
export type ApprovedQuotationTeam = {
  teamId: string;
  quotedHours: number;
};

/** Preserva la Fase 1 de prospección sin crear módulos ni semanas:
 * solo suma las HH nuevas de la cotización aprobada al presupuesto de
 * los equipos que ya estaban asignados. Los equipos históricos ausentes
 * en la nueva cotización quedan intocados en project_teams.
 *
 * SoldHours y UsedHours son distintos: este cálculo jamás modifica consumo.
 */
export function planCommercialPreparationTransfer(input: {
  previousSoldHours: number;
  approvedQuotationHours: number;
  existingTeams: readonly ExistingProspectTeam[];
  quotationTeams: readonly ApprovedQuotationTeam[];
}): {
  projectSoldHours: number;
  phase1AssignedHours: number;
  teamAllocations: Array<{
    teamId: string; phase1Hours: number; quotationHours: number;
    combinedHours: number; existedBefore: boolean;
  }>;
} {
  const cents = (value: number): number => {
    if (!Number.isFinite(value) || value < 0 ||
        Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) {
      throw new Error('Las HH del traspaso deben ser no negativas y tener hasta dos decimales.');
    }
    return Math.round(value * 100);
  };
  const existing = new Map<string, number>();
  for (const row of input.existingTeams) {
    if (existing.has(row.teamId)) throw new Error('Equipo histórico duplicado.');
    existing.set(row.teamId, cents(row.assignedHours === null ? 0 :
      Number(row.assignedHours)));
  }
  const seen = new Set<string>();
  let sumQuotation = 0;
  const teamAllocations = input.quotationTeams.map((row) => {
    if (seen.has(row.teamId)) throw new Error('Equipo de cotización duplicado.');
    seen.add(row.teamId);
    const quotation = cents(row.quotedHours);
    sumQuotation += quotation;
    const previous = existing.get(row.teamId) ?? 0;
    return {
      teamId: row.teamId, phase1Hours: previous / 100,
      quotationHours: quotation / 100,
      combinedHours: (previous + quotation) / 100,
      existedBefore: existing.has(row.teamId),
    };
  });
  if (sumQuotation !== cents(input.approvedQuotationHours)) {
    throw new Error('Las HH aprobadas no concilian con las asignaciones de equipos.');
  }
  return {
    projectSoldHours: (cents(input.previousSoldHours) +
      cents(input.approvedQuotationHours)) / 100,
    phase1AssignedHours: [...existing.values()].reduce((sum, value) =>
      sum + value, 0) / 100,
    teamAllocations,
  };
}
