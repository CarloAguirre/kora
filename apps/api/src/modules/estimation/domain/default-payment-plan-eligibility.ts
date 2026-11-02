/**
 * El caso de uso de creación de proyectos instala 2 hitos por defecto
 * incluso cuando aún no existe contrato: Inicio 50%, Marcha blanca 50%,
 * ambos con monto cero. Estos registros NO equivalen a facturación.
 *
 * La aceptación del baseline de planificación puede coexistir solo con el
 * plan inicial exacto y no emitido; no modifica las filas ni sus porcentajes.
 */
export interface ExistingProjectPaymentMilestone {
  name: string;
  percent: number | string | null;
  amount: number | string;
  sortOrder: number;
  triggerType: string;
  triggerPhase: string | null;
  triggerDate: Date | string | null;
  status: string;
  invoiceNumber: string | null;
  issuedAt: Date | string | null;
  dueAt: Date | string | null;
  paidAt: Date | string | null;
}

export function hasOnlyUntouchedDefaultPaymentMilestones(
  milestones: readonly ExistingProjectPaymentMilestone[],
): boolean {
  if (milestones.length === 0) return true;
  if (milestones.length !== 2) return false;
  const sorted = [...milestones].sort((a, b) => a.sortOrder - b.sortOrder);
  const unbilled = (row: ExistingProjectPaymentMilestone) =>
    row.status === 'pending' &&
    Number(row.amount) === 0 &&
    Number(row.percent) === 50 &&
    row.invoiceNumber === null &&
    row.issuedAt === null &&
    row.dueAt === null &&
    row.paidAt === null &&
    row.triggerDate === null;
  return unbilled(sorted[0]!) && unbilled(sorted[1]!) &&
    sorted[0]!.sortOrder === 0 &&
    sorted[0]!.name === 'Inicio' &&
    sorted[0]!.triggerType === 'approval' &&
    sorted[0]!.triggerPhase === null &&
    sorted[1]!.sortOrder === 1 &&
    sorted[1]!.name === 'Marcha blanca' &&
    sorted[1]!.triggerType === 'phase' &&
    sorted[1]!.triggerPhase === 'pilot';
}
