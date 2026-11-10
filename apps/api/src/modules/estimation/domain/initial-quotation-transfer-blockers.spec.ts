import { describe, expect, it } from 'vitest';
import { initialQuotationTransferBlockers } from './initial-quotation-transfer-blockers';
const empty = {
  soldHours:0, usedHours:0, hasStartDate:false, hasContractAmount:false,
  projectTeamCount:0, moduleCount:0, hourEntryCount:0, hasChangedPaymentPlan:false,
};
describe('Diagnóstico previo al traspaso inicial', () => {
  it('permite avanzar solo si no hay evidencia operativa', () => {
    expect(initialQuotationTransferBlockers(empty)).toEqual([]);
  });
  it('identifica de manera puntual la ejecución histórica sin borrarla', () => {
    expect(initialQuotationTransferBlockers({
      ...empty, soldHours:2489, usedHours:5143.75, projectTeamCount:4,
      moduleCount:2, hourEntryCount:12,
    })).toEqual([
      'HH vendidas existentes','HH consumidas existentes','4 equipos asignados',
      '2 fases/módulos existentes','12 registros de horas',
    ]);
  });
  it('reconoce tanto pagos alterados como fecha y monto contractual', () => {
    expect(initialQuotationTransferBlockers({
      ...empty, hasStartDate:true, hasContractAmount:true, hasChangedPaymentPlan:true,
    })).toHaveLength(3);
  });
});
