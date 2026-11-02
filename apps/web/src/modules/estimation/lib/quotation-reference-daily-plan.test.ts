import { describe, expect, it } from 'vitest';
import {
  estimationPocProposalSchema, quotationReferenceEdtSchema,
  type EstimationPocRole, type QuotationReferenceEdt,
} from '@kora/contracts';
import { buildReferenceDailyPlan, referenceDailyPlanCsv } from './quotation-reference-daily-plan';

const edt = quotationReferenceEdtSchema.parse({
  schemaVersion: 'kora.quotation.reference-edt.v2',
  source: 'kdm_demo', provider: 'gemini',
  totalHours: 50, reservePercent: 0, reserveHours: 0, totalWithReserve: 50,
  stages: [
    { code: 'T01', name: 'Diseño y base', startWeek: 1, durationWeeks: 2, totalHours: 30 },
    { code: 'T02', name: 'Pruebas y entrega', startWeek: 2, durationWeeks: 1, totalHours: 20 },
  ],
  modules: [{
    name: 'Portal', totalHours: 50,
    tasks: [
      { wbs: 'T01.01', name: 'Diseño e implementación',
        role: 'Desarrollo', hours: 30, stageCode: 'T01',
        roleEffort: [{ role: 'Desarrollo', hours: 20 }, { role: 'QA', hours: 10 }] },
      { wbs: 'T02.01', name: 'Correcciones de entrega',
        role: 'Desarrollo', hours: 20, stageCode: 'T02',
        roleEffort: [{ role: 'Desarrollo', hours: 20 }] },
    ],
  }],
});

const roles = estimationPocProposalSchema.parse({
  projectId: '0777e456-fd76-445e-83f1-afc25061c101',
  provider: 'gemini', sourceMode: 'poc_simulated',
  documentsAnalyzed: 1, summary: 'Ejemplo para distribuir HH de referencia.',
  roles: [
    { role: 'Desarrollo', unit: 'week', duration: 1, hoursPerUnit: 40, people: 1,
      totalHours: 40 },
    { role: 'QA', unit: 'week', duration: 1, hoursPerUnit: 20, people: 1,
      totalHours: 10 },
  ], totalHours: 50, assumptions: [], clarifyingQuestions: [],
}).roles;

describe('Plan_Diario referencial derivado de EDT v2', () => {
  it('reparte todas las HH sin alterar la EDT, agrupa WBS multiperfil y limita capacidad diaria', () => {
    const baseline = structuredClone(edt);
    const result = buildReferenceDailyPlan(edt, roles);
    expect(result).not.toBeNull();
    expect(result!.issues).toEqual([]);
    expect(result!.sourceHours).toBe(50);
    expect(result!.plannedHours).toBe(50);
    expect(result!.pendingHours).toBe(0);
    expect(result!.stageCount).toBe(2);
    expect(result!.rows.some((row) => row.wbs === 'T01.01' && row.role === 'QA')).toBe(true);
    expect(result!.rows.some((row) => row.wbs === 'T01.01' && row.role === 'Desarrollo')).toBe(true);
    expect(result!.rows.filter((row) => row.wbs === 'T02.01')
      .every((row) => row.day >= 6 && row.day <= 10)).toBe(true);

    const sums = new Map<string, number>();
    for (const row of result!.rows) {
      const key = row.role + ':' + row.day;
      sums.set(key, (sums.get(key) ?? 0) + row.hours);
    }
    for (const [key, total] of sums) {
      expect(total).toBeLessThanOrEqual(key.startsWith('QA:') ? 4 : 8);
    }
    expect(edt).toEqual(baseline);
  });

  it('advierte si las semanas no alcanzan; no inventa nuevas semanas ni reduce HH de Gemini', () => {
    const overloaded = structuredClone(edt);
    overloaded.stages = [
      { code: 'T01', name: 'Una semana', startWeek: 1, durationWeeks: 1, totalHours: 30 },
      { code: 'T02', name: 'Otra semana', startWeek: 1, durationWeeks: 1, totalHours: 20 },
    ];
    const reducedCapacity = roles.map((role) => role.role === 'Desarrollo'
      ? { ...role, hoursPerUnit: 20 } : role);
    const result = buildReferenceDailyPlan(overloaded, reducedCapacity);
    expect(result?.plannedHours).toBe(30);
    expect(result?.pendingHours).toBe(20);
    expect(result?.sourceHours).toBe(50);
    expect(result?.issues.length).toBeGreaterThan(0);
    expect(result?.rows.every((row) => row.day <= 5)).toBe(true);
  });

  it('conserva los centésimos y admite varias personas por perfil', () => {
    const small = quotationReferenceEdtSchema.parse({
      schemaVersion: 'kora.quotation.reference-edt.v2',
      source: 'kdm_demo', provider: 'gemini',
      totalHours: 16.05, reservePercent: 0, reserveHours: 0, totalWithReserve: 16.05,
      stages: [{ code: 'T01', name: 'Revisión', startWeek: 1, durationWeeks: 1, totalHours: 16.05 }],
      modules: [{ name: 'Portal', totalHours: 16.05, tasks: [{
        wbs: '1.1', name: 'Actividad', role: 'Desarrollo',
        hours: 16.05, stageCode: 'T01', roleEffort: [{ role: 'Desarrollo', hours: 16.05 }],
      }] }],
    });
    const doubled: EstimationPocRole[] = [{ ...roles[0]!, people: 2 }];
    const result = buildReferenceDailyPlan(small, doubled);
    expect(result?.issues).toEqual([]);
    expect(result?.plannedHours).toBe(16.05);
    expect(result?.rows[0]?.hours).toBe(16);
    expect(result?.rows[1]?.hours).toBe(0.05);
  });

  it('genera CSV con las columnas de Plan_Diario pero sin fechas ni asignados', () => {
    const plan = buildReferenceDailyPlan(edt, roles)!;
    const csv = referenceDailyPlanCsv(plan, (role) => role === 'QA' ? 'Equipo QA' : role);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Día hábil relativo";"Fecha";"Tramo"');
    expect(csv).toContain('"Equipo QA"');
    expect(csv).toContain('"";"T01"');
    expect(csv).toContain('"Referencial"');
    expect(csv).toContain('sin fecha ni responsable');
  });

  it('mantiene EDT v1 fuera del plan diario para no fingir que tenía tramos', () => {
    const legacy = quotationReferenceEdtSchema.parse({
      schemaVersion: 'kora.quotation.reference-edt.v1',
      source: 'kdm_demo', provider: 'gemini', totalHours: 10,
      modules: [{ name: 'Portal', totalHours: 10, tasks: [
        { wbs: '1.1', name: 'Tarea', role: 'QA', hours: 10 },
      ] }],
    }) satisfies QuotationReferenceEdt;
    expect(buildReferenceDailyPlan(legacy, roles)).toBeNull();
  });
});
