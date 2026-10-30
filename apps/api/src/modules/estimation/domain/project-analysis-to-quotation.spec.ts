import { describe, expect, it } from 'vitest';
import { estimationAnalysisArtifactSchema } from '@kora/contracts';
import { projectAnalysisToQuotationDraft } from './project-analysis-to-quotation';

const ids = {
  Fullstack: '0777e456-fd76-445e-83f1-afc25061c101',
  UX: '0777e456-fd76-445e-83f1-afc25061c102',
};
const artifact = estimationAnalysisArtifactSchema.parse({
  schemaVersion: 'kora.estimation.analysis.v1',
  provenance: {
    mode: 'simulated_fixture', provider: null, model: null,
    label: 'Ejemplo ficticio', warning: 'Sin IA real',
    sourceFiles: [{ id: 'edt', name: 'EDT.xlsx', kind: 'edt', sha256: 'a'.repeat(64) }],
  },
  project: { name: 'Ejemplo', client: 'Pruebas', objective: 'Probar presupuesto' },
  scope: { included: ['Fase 1'], excluded: ['SAP'], validationStatus: 'ejemplo' },
  sourceRequirements: [], userStories: [], pendingDecisions: [],
  roles: [
    { role: 'Fullstack', headcount: 1, baseHours: 16 },
    { role: 'UX/UI', headcount: 1, baseHours: 4 },
  ],
  modules: [{ name: 'Portal', activityCount: 2, hoursByRole: { Fullstack: 16, 'UX/UI': 4 }, totalHours: 20 }],
  tranches: [{
    id: 'T01', name: 'Desarrollo', startWeek: 1, durationWeeks: 2,
    totalHours: 20, hoursByRole: { Fullstack: 16, 'UX/UI': 4 },
  }],
  activities: [
    { wbs: 'T01.01', trancheId: 'T01', module: 'Portal', description: 'API',
      requirementIds: [], sourceClassification: 'D', responsibleRole: 'Fullstack',
      hoursByRole: { Fullstack: 16, 'UX/UI': 0 }, totalHours: 16 },
    { wbs: 'T01.02', trancheId: 'T01', module: 'Portal', description: 'Figma',
      requirementIds: [], sourceClassification: 'D', responsibleRole: 'UX/UI',
      hoursByRole: { Fullstack: 0, 'UX/UI': 4 }, totalHours: 4 },
  ],
  dailyPlan: [], weeklyPlan: [], milestones: [], assumptions: [],
  summary: { baseHours: 20, reservePercent: 10, reserveHours: 2,
    hoursWithReserve: 22, durationWorkingDays: 8, hoursByRole: { Fullstack: 16, 'UX/UI': 4 } },
  commercial: { hourlyRate: null, currency: null, tax: null, paymentPlan: [] },
  roleTeamMappings: { status: 'requires_user_confirmation', suggestions: {} },
  renderBlueprints: { ers: [], edt: [] },
});

describe('projectAnalysisToQuotationDraft', () => {
  it('conserva las HH y el artefacto para documentos sin incorporar la reserva', () => {
    const draft = projectAnalysisToQuotationDraft(artifact, { Fullstack: ids.Fullstack, 'UX/UI': ids.UX });
    expect(draft.mode).toBe('phases');
    expect(draft.phases[0]?.teamHours).toHaveLength(2);
    expect(draft.teams.find((team) => team.teamId === ids.Fullstack)?.dedicationPercent).toBe(20);
    expect(draft.teams.find((team) => team.teamId === ids.UX)?.dedicationPercent).toBe(5);
    expect(draft.phases[0]?.teamHours.reduce((n, x) => n + x.hours, 0)).toBe(20);
    expect(draft.analysis?.activities).toHaveLength(2);
    expect(draft.analysis?.summary.reserveHours).toBe(2);
    expect(draft.analysisProjectionStatus).toBe('synced');
    expect(draft.exclusions).toEqual(['SAP']);
  });

  it('agrega roles en el mismo equipo sin duplicarlo ni perder desglose original', () => {
    const draft = projectAnalysisToQuotationDraft(artifact, { Fullstack: ids.Fullstack, 'UX/UI': ids.Fullstack });
    expect(draft.teams).toHaveLength(1);
    expect(draft.teams[0]?.collaborators).toBe(2);
    expect(draft.teams[0]?.dedicationPercent).toBe(12.5);
    expect(draft.phases[0]?.teamHours).toEqual([{ teamId: ids.Fullstack, hours: 20 }]);
    expect(draft.analysis?.roles).toHaveLength(2);
  });

  it('no inventa correspondencias ni omite perfiles del EDT', () => {
    expect(() => projectAnalysisToQuotationDraft(artifact, { Fullstack: ids.Fullstack })).toThrow();
  });
});
