import { describe, expect, it } from 'vitest';
import { quotationDraftDataSchema } from '@kora/contracts';
import { buildQuotationRedistributionPreview } from './quotation-hour-redistribution-preview';

const team = '0777e456-fd76-445e-83f1-afc25061c101';
const original = () => quotationDraftDataSchema.parse({
  mode: 'phases',
  teams: [{ teamId: team, collaborators: 1, unit: 'week',
    duration: 2, hoursPerWeek: 40, dedicationPercent: 100 }],
  aiPoc: {
    source: 'kdm_demo', answers: [], roleTeamIds: { QA: team },
    proposal: { projectId: '0777e456-fd76-445e-83f1-afc25061c102',
      provider: 'gemini', sourceMode: 'poc_simulated', summary: 'QA',
      documentsAnalyzed: 1, roles: [{ role: 'QA', unit: 'week',
        duration: 2, hoursPerUnit: 30, people: 1, totalHours: 60 }],
      totalHours: 60, assumptions: [], clarifyingQuestions: [] },
    edt: { schemaVersion: 'kora.quotation.reference-edt.v2',
      source: 'kdm_demo', provider: 'gemini',
      totalHours: 60, reservePercent: 0, reserveHours: 0, totalWithReserve: 60,
      stages: [{ code: 'QA', name: 'Pruebas', startWeek: 1, durationWeeks: 2, totalHours: 60 }],
      modules: [{ name: 'Pruebas', totalHours: 60, tasks: [
        { wbs: 'QA.01', role: 'QA', name: 'Casos', hours: 20, stageCode: 'QA',
          roleEffort: [{ role: 'QA', hours: 20 }] },
        { wbs: 'QA.02', role: 'QA', name: 'Ejecución', hours: 20, stageCode: 'QA',
          roleEffort: [{ role: 'QA', hours: 20 }] },
        { wbs: 'QA.03', role: 'QA', name: 'UAT', hours: 20, stageCode: 'QA',
          roleEffort: [{ role: 'QA', hours: 20 }] },
      ] }],
    },
  },
});
describe('vista previa atómica de redistribución de HH', () => {
  it('no modifica el borrador original; conserva centésimos y detalle exacto', () => {
    const draft = original();
    const preview = buildQuotationRedistributionPreview(draft,
      { teamKey: team, stageCode: 'QA', targetHours: 64 });
    expect(draft.aiPoc?.edt?.totalHours).toBe(60);
    expect(draft.edtHourAdjustments).toBeUndefined();
    expect(preview.before).toBe(60);
    expect(preview.after).toBe(64);
    expect(preview.delta).toBe(4);
    expect(preview.changes.map((row) => row.after)).toEqual([21.34, 21.33, 21.33]);
    expect(preview.changes.reduce((sum, row) => sum + Math.round(row.delta * 100), 0))
      .toBe(400);
  });
  it('respeta filas marcadas como fijas y rechaza redistribuciones imposibles', () => {
    const draft = { ...original(),
      edtTaskSettings: [{ wbs: 'QA.01', role: 'QA', fixed: true }] };
    const preview = buildQuotationRedistributionPreview(draft,
      { teamKey: team, targetHours: 62 });
    expect(preview.changes[0]).toMatchObject({ fixed: true, before: 20, after: 20, delta: 0 });
    expect(preview.changes.slice(1).map((row) => row.after)).toEqual([21, 21]);
    expect(() => buildQuotationRedistributionPreview(draft,
      { teamKey: team, targetHours: 20 })).toThrow();
  });
});
