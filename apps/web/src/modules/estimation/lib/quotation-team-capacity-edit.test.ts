import { describe, expect, it } from 'vitest';
import {
  quotationDraftDataSchema, quotationEdtAssignments,
  effectiveQuotationEdt, reconcilePocCommercialDraft,
  synchronizeQuotationEdtTeamLoad,
} from '@kora/contracts';
import {
  linkedQuotationTeamCapacity, buildQuotationTeamCapacityEdit,
} from './quotation-team-capacity-edit';

const teamId = '0777e456-fd76-445e-83f1-afc25061c101';
const projectId = '0777e456-fd76-445e-83f1-afc25061c102';
const team = (hoursPerWeek = 40, dedicationPercent = 100) => ({
  teamId, collaborators: 3, unit: 'week' as const, duration: 12,
  hoursPerWeek, dedicationPercent,
});
const source = () => quotationDraftDataSchema.parse({
  mode: 'phases',
  teams: [team()],
  aiPoc: {
    source: 'kdm_demo', answers: [],
    roleTeamIds: { Desarrollo: teamId },
    proposal: {
      projectId, provider: 'gemini', sourceMode: 'poc_simulated',
      documentsAnalyzed: 1, summary: 'Plan de desarrollo',
      roles: [{ role: 'Desarrollo', unit: 'week', duration: 12,
        hoursPerUnit: 40, people: 3, totalHours: 120 }],
      totalHours: 120, assumptions: [], clarifyingQuestions: [],
    },
    edt: {
      schemaVersion: 'kora.quotation.reference-edt.v2',
      source: 'kdm_demo', provider: 'gemini',
      totalHours: 120, reservePercent: 0,
      reserveHours: 0, totalWithReserve: 120,
      stages: [{ code: 'DEV', name: 'Construcción', startWeek: 1,
        durationWeeks: 12, totalHours: 120 }],
      modules: [{ name: 'Proyecto', totalHours: 120, tasks: [
        { wbs: 'DEV.01', name: 'Backend', role: 'Desarrollo',
          hours: 80, stageCode: 'DEV',
          roleEffort: [{ role: 'Desarrollo', hours: 80 }] },
        { wbs: 'DEV.02', name: 'Frontend', role: 'Desarrollo',
          hours: 40, stageCode: 'DEV',
          roleEffort: [{ role: 'Desarrollo', hours: 40 }] },
      ] }],
    },
  },
});

describe('Capacidad comercial vinculada de equipos', () => {
  it('40 HH = 100%, 20 HH = 50%, 75% = 30 HH; no permite superar jornada', () => {
    expect(linkedQuotationTeamCapacity('hoursPerWeek', 40))
      .toEqual({ hoursPerWeek: 40, dedicationPercent: 100 });
    expect(linkedQuotationTeamCapacity('hoursPerWeek', 20))
      .toEqual({ hoursPerWeek: 20, dedicationPercent: 50 });
    expect(linkedQuotationTeamCapacity('dedicationPercent', 75))
      .toEqual({ hoursPerWeek: 30, dedicationPercent: 75 });
    expect(() => linkedQuotationTeamCapacity('hoursPerWeek', 45)).toThrow();
    expect(() => linkedQuotationTeamCapacity('dedicationPercent', 125)).toThrow();
  });

  it('en EDT 120 HH bajan a 60 al pasar a 20 HH/sem; cambio y tareas se confirman juntos', () => {
    const before = source();
    const { draft, preview } = buildQuotationTeamCapacityEdit(
      before, teamId, 'hoursPerWeek', 20);
    expect(draft).toBe(before);
    expect(preview?.before).toBe(120);
    expect(preview?.after).toBe(60);
    expect(preview?.capacityChange).toMatchObject({
      beforeHoursPerWeek: 40, afterHoursPerWeek: 20,
      beforeDedicationPercent: 100, afterDedicationPercent: 50,
    });
    expect(before.teams[0]?.hoursPerWeek).toBe(40);
    expect(before.aiPoc?.edt?.totalHours).toBe(120);
    expect(preview?.nextDraft.edtCapacityCustomizedTeamIds).toEqual([teamId]);
    const after = preview!.nextDraft;
    expect(quotationEdtAssignments(after).map((row) => row.hours)).toEqual([50, 10]);
    expect(effectiveQuotationEdt(after)?.totalHours).toBe(60);
    const reconciled = reconcilePocCommercialDraft(after);
    expect(reconciled.teams[0]).toMatchObject({
      hoursPerWeek: 20, dedicationPercent: 50,
    });
    expect(reconciled.aiPoc?.edt).toEqual(before.aiPoc?.edt);
    const increase = buildQuotationTeamCapacityEdit(
      reconciled, teamId, 'dedicationPercent', 75);
    expect(increase.preview?.before).toBe(60);
    expect(increase.preview?.after).toBe(90);
    expect(increase.preview?.nextDraft.teams[0]).toMatchObject({
      hoursPerWeek: 30, dedicationPercent: 75,
    });
  });

  it('respeta tareas fijas, y rechaza cambios que bajarían su mínimo', () => {
    const before = { ...source(),
      edtTaskSettings: [{ wbs: 'DEV.01', role: 'Desarrollo', fixed: true }] };
    const result = buildQuotationTeamCapacityEdit(before, teamId, 'dedicationPercent', 75);
    expect(result.preview?.changes.find((row) => row.wbs === 'DEV.01'))
      .toMatchObject({ fixed: true, before: 80, after: 80 });
    expect(() => buildQuotationTeamCapacityEdit(
      before, teamId, 'dedicationPercent', 50)).toThrow();
    expect(before.edtHourAdjustments).toBeUndefined();
  });

  it('un borrador EDT legado inicia con 40/100 sin cambiar las HH fuente', () => {
    const legacy = source();
    legacy.teams[0]!.hoursPerWeek = 23.67;
    legacy.teams[0]!.dedicationPercent = 100;
    const normalized = synchronizeQuotationEdtTeamLoad(legacy);
    expect(normalized.teams[0]).toMatchObject({
      hoursPerWeek: 40, dedicationPercent: 100,
    });
    expect(normalized.aiPoc?.edt?.totalHours).toBe(120);
    expect(quotationEdtAssignments(normalized)
      .reduce((sum, row) => sum + row.hours, 0)).toBe(120);
  });

  it('en modo manual no usa duplicado de dedicación y escala HH por fase', () => {
    const manual = quotationDraftDataSchema.parse({
      mode: 'team', teams: [team()],
    });
    const result = buildQuotationTeamCapacityEdit(manual, teamId, 'dedicationPercent', 50);
    expect(result.preview).toBeNull();
    expect(result.draft.teams[0]).toMatchObject({ hoursPerWeek: 20, dedicationPercent: 50 });
    const phases = quotationDraftDataSchema.parse({
      mode: 'phases', teams: [team()],
      phases: [{ name: 'Etapa 1', startWeek: 1, durationWeeks: 2,
        teamHours: [{ teamId, hours: 80 }] },
      { name: 'Etapa 2', startWeek: 3, durationWeeks: 2,
        teamHours: [{ teamId, hours: 40 }] }],
    });
    const changed = buildQuotationTeamCapacityEdit(phases, teamId, 'hoursPerWeek', 20).draft;
    expect(changed.phases.map((stage) => stage.teamHours[0]?.hours)).toEqual([40, 20]);
  });
});
