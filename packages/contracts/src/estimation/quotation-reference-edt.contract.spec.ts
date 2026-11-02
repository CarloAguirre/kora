import { describe, expect, it } from 'vitest';
import { quotationReferenceEdtSchema } from './quotation-reference-edt.contract';

const detail = {
  schemaVersion: 'kora.quotation.reference-edt.v2',
  source: 'kdm_demo', provider: 'gemini', totalHours: 40,
  reservePercent: 10, reserveHours: 4, totalWithReserve: 44,
  stages: [{ code: 'T01', name: 'Desarrollo', startWeek: 1, durationWeeks: 2, totalHours: 40 }],
  modules: [{
    name: 'Portal', totalHours: 40,
    tasks: [{
      wbs: 'T01.01', name: 'Matriz de aprobaciones', description: 'Crear flujo y pruebas.',
      role: 'Desarrollo', hours: 40, stageCode: 'T01',
      submodule: 'Aprobaciones', referenceIds: ['R09', 'R10'], classification: 'C',
      roleEffort: [{ role: 'Desarrollo', hours: 30 }, { role: 'QA', hours: 10 }],
    }],
  }],
};

describe('EDT comercial por actividad y perfil (v2)', () => {
  it('conserva sumas por actividad, módulo, tramo y reserva separada', () => {
    const value = quotationReferenceEdtSchema.parse(detail);
    expect(value.totalHours).toBe(40);
    expect(value.reserveHours).toBe(4);
    expect(value.totalWithReserve).toBe(44);
    expect(value.modules[0]?.tasks[0]?.roleEffort).toHaveLength(2);
  });
  it('rechaza discrepancias entre HH de perfiles, actividades, módulos y tramos', () => {
    const wrongTask = structuredClone(detail);
    wrongTask.modules[0]!.tasks[0]!.hours = 42;
    expect(quotationReferenceEdtSchema.safeParse(wrongTask).success).toBe(false);
    const wrongStage = structuredClone(detail);
    wrongStage.stages[0]!.totalHours = 39;
    expect(quotationReferenceEdtSchema.safeParse(wrongStage).success).toBe(false);
    const wrongReserve = structuredClone(detail);
    wrongReserve.reserveHours = 5;
    expect(quotationReferenceEdtSchema.safeParse(wrongReserve).success).toBe(false);
  });
  it('mantiene compatibilidad con EDT v1 de cotizaciones ya creadas', () => {
    const previous = quotationReferenceEdtSchema.parse({
      schemaVersion: 'kora.quotation.reference-edt.v1',
      source: 'kdm_demo', provider: 'gemini', totalHours: 25,
      modules: [{ name: 'Portal', totalHours: 25, tasks: [
        { wbs: '1.1', name: 'Backend', description: 'API', role: 'Desarrollo', hours: 25 },
      ] }],
    });
    expect(previous.stages).toBeUndefined();
    expect(previous.modules[0]?.tasks[0]?.roleEffort).toBeUndefined();
  });
});
