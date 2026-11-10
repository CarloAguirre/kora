/** Razones específicas para NO reemplazar una planificación operativa.
 * Es una precondición de traspaso inicial, no un motor de conciliación histórica.
 * Jamás considerar las HH consumidas como un dato que se pueda reiniciar.
 */
export type InitialQuotationTransferSnapshot = {
  soldHours: number;
  usedHours: number;
  hasStartDate: boolean;
  hasContractAmount: boolean;
  projectTeamCount: number;
  moduleCount: number;
  hourEntryCount: number;
  hasChangedPaymentPlan: boolean;
};

export function initialQuotationTransferBlockers(s: InitialQuotationTransferSnapshot): string[] {
  const reasons: string[] = [];
  if (s.soldHours !== 0) reasons.push('HH vendidas existentes');
  if (s.usedHours !== 0) reasons.push('HH consumidas existentes');
  if (s.hasStartDate) reasons.push('fecha de inicio definida');
  if (s.hasContractAmount) reasons.push('monto de contrato existente');
  if (s.projectTeamCount > 0) reasons.push(s.projectTeamCount + ' equipos asignados');
  if (s.moduleCount > 0) reasons.push(s.moduleCount + ' fases/módulos existentes');
  if (s.hourEntryCount > 0) reasons.push(s.hourEntryCount + ' registros de horas');
  if (s.hasChangedPaymentPlan) reasons.push('plan de pagos diferente al predeterminado o facturado');
  return reasons;
}
