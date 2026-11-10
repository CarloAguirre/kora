import { describe, expect, it } from 'vitest';
import { estimationAnalysisArtifactSchema } from './analysis-artifact.contract';

const example = {
  schemaVersion: 'kora.estimation.analysis.v1',
  provenance: {
    mode: 'simulated_fixture', provider: null, model: null,
    label: 'Prueba de conciliación', warning: 'No es IA real',
    sourceFiles: [{ id: 'edt', name: 'EDT.xlsx', kind: 'edt', sha256: 'a'.repeat(64) }],
  },
  project: { name: 'Portal', client: 'Prueba', objective: 'Validar EDT' },
  scope: { included: ['Portal'], excluded: [], validationStatus: 'Ejemplo' },
  sourceRequirements: [{ id: 'R01', text: 'Formularios', origin: 'ERS', acceptance: 'Validado' }],
  userStories: [{ id: 'HU01', actor: 'Usuario', need: 'Enviar formulario',
    acceptance: 'Guardado', requirementIds: ['R01'] }],
  pendingDecisions: [],
  roles: [{ role: 'Fullstack', headcount: 1, baseHours: 4 }],
  modules: [{ name: 'Portal', activityCount: 2, hoursByRole: { Fullstack: 4 }, totalHours: 4 }],
  tranches: [{ id: 'T01', name: 'Construcción', startWeek: 1, durationWeeks: 1,
    hoursByRole: { Fullstack: 4 }, totalHours: 4 }],
  activities: [
    { wbs: 'T01.01', trancheId: 'T01', module: 'Portal', description: 'API',
      requirementIds: ['R01'], sourceClassification: 'C', responsibleRole: 'Fullstack',
      hoursByRole: { Fullstack: 2 }, totalHours: 2 },
    { wbs: 'T01.02', trancheId: 'T01', module: 'Portal', description: 'UI',
      requirementIds: ['R01'], sourceClassification: 'C', responsibleRole: 'Fullstack',
      hoursByRole: { Fullstack: 2 }, totalHours: 2 },
  ],
  dailyPlan: [
    { workingDay: 1, trancheId: 'T01', role: 'Fullstack', activityId: 'ACT-001',
      wbs: 'T01.01', description: 'API', hours: 2 },
    { workingDay: 1, trancheId: 'T01', role: 'Fullstack', activityId: 'ACT-002',
      wbs: 'T01.02', description: 'UI', hours: 2 },
  ],
  weeklyPlan: [{ week: 'S01', hoursByRole: { Fullstack: 4 } }],
  milestones: [], assumptions: [],
  summary: { baseHours: 4, reservePercent: 10, reserveHours: 0.4,
    hoursWithReserve: 4.4, durationWorkingDays: 1, hoursByRole: { Fullstack: 4 } },
  commercial: { hourlyRate: null, currency: null, tax: null, paymentPlan: [] },
  roleTeamMappings: { status: 'pending', suggestions: {} },
  renderBlueprints: { ers: [], edt: [] },
};

describe('estimationAnalysisArtifactSchema: conciliación EDT', () => {
  it('acepta plan diario WBS y actividades con totales concordantes', () => {
    expect(estimationAnalysisArtifactSchema.safeParse(example).success).toBe(true);
  });

  it('rechaza horas asignadas a WBS erróneo aunque la suma total sea igual', () => {
    const invalid = structuredClone(example);
    invalid.dailyPlan[0]!.hours = 3;
    invalid.dailyPlan[1]!.hours = 1;
    const result = estimationAnalysisArtifactSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) =>
        issue.message.includes('Plan diario y actividades WBS'))).toBe(true);
    }
  });

  it('rechaza WBS inexistente en una asignación diaria', () => {
    const invalid = structuredClone(example);
    invalid.dailyPlan[0]!.wbs = 'T99.99';
    expect(estimationAnalysisArtifactSchema.safeParse(invalid).success).toBe(false);
  });

  it('rechaza un cronograma semanal que no suma las HH base', () => {
    const invalid = structuredClone(example);
    invalid.weeklyPlan[0]!.hoursByRole.Fullstack = 6;
    expect(estimationAnalysisArtifactSchema.safeParse(invalid).success).toBe(false);
  });

  it('rechaza referencias RF inexistentes y conteos de módulo divergentes', () => {
    const invalid = structuredClone(example);
    invalid.activities[0]!.requirementIds = ['R99'];
    invalid.modules[0]!.activityCount = 3;
    const result = estimationAnalysisArtifactSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining(['Referencia a requisito inexistente.',
          'Módulo y actividades EDT no concuerdan.']),
      );
    }
  });
});
