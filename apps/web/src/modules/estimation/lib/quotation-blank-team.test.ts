import { describe, expect, it } from 'vitest';
import { quotationDraftDataSchema } from '@kora/contracts';
import { emptyQuotationTeam, withQuotationTeamEdit } from './quotation-blank-team';

const dev = '0777e456-fd76-445e-83f1-afc25061c103';
const qa = '0777e456-fd76-445e-83f1-afc25061c104';
const blank = () => quotationDraftDataSchema.parse({ mode: 'team', teams: [], phases: [] });

describe('Edición directa de equipos en cotización en blanco', () => {
  it('crea el primer equipo al editar duración, sin requerir checkbox previo', () => {
    const original = blank();
    const edited = withQuotationTeamEdit(original, dev, { duration: 3 });
    expect(original.teams).toEqual([]);
    expect(edited.teams).toEqual([{
      teamId: dev, collaborators: 1, unit: 'week', duration: 3,
      hoursPerWeek: 40, dedicationPercent: 100,
    }]);
    expect(edited.teams[0]!.collaborators * edited.teams[0]!.duration *
      edited.teams[0]!.hoursPerWeek)
      .toBe(120);
    expect(quotationDraftDataSchema.parse(edited)).toEqual(edited);
  });

  it('al editar otro campo conserva las modificaciones y no duplica equipos', () => {
    const initial = withQuotationTeamEdit(blank(), dev, { duration: 3 });
    const later = withQuotationTeamEdit(initial, dev, { collaborators: 2 });
    const withQA = withQuotationTeamEdit(later, qa, { hoursPerWeek: 25 });
    expect(withQA.teams).toHaveLength(2);
    expect(withQA.teams.find((team) => team.teamId === dev)).toMatchObject({
      duration: 3, collaborators: 2,
    });
    expect(withQA.teams.find((team) => team.teamId === qa)).toMatchObject({
      duration: 1, hoursPerWeek: 25,
    });
    expect(quotationDraftDataSchema.safeParse(withQA).success).toBe(true);
  });

  it('permite editar primero unidad y dedicación sin alterar la identidad del equipo', () => {
    const withUnit = withQuotationTeamEdit(blank(), dev, { unit: 'day', duration: 5 });
    const withDedication = withQuotationTeamEdit(withUnit, dev, {
      dedicationPercent: 50, teamId: qa,
    });
    expect(withDedication.teams).toEqual([{
      ...emptyQuotationTeam(dev), unit: 'day', duration: 5,
      dedicationPercent: 50,
    }]);
  });

  it('nunca incorpora implícitamente un equipo ausente a una EDT IA', () => {
    const ai = quotationDraftDataSchema.parse({
      ...blank(),
      aiPoc: {
        source: 'kdm_demo', answers: [], roleTeamIds: {},
        proposal: {
          projectId: '0777e456-fd76-445e-83f1-afc25061c100',
          provider: 'gemini', sourceMode: 'poc_simulated',
          documentsAnalyzed: 1, summary: 'Propuesta',
          roles: [{ role: 'Desarrollo', unit: 'week', duration: 1,
            hoursPerUnit: 40, people: 1, totalHours: 40 }],
          totalHours: 40, assumptions: [], clarifyingQuestions: [],
        },
        edt: {
          schemaVersion: 'kora.quotation.reference-edt.v2',
          source: 'kdm_demo', provider: 'gemini',
          totalHours: 40, reservePercent: 0, reserveHours: 0,
          totalWithReserve: 40,
          stages: [{ code: 'S1', name: 'Construcción',
            startWeek: 1, durationWeeks: 1, totalHours: 40 }],
          modules: [{ name: 'Portal', totalHours: 40, tasks: [
            { wbs: 'S1.01', name: 'Backend', role: 'Desarrollo',
              hours: 40, stageCode: 'S1',
              roleEffort: [{ role: 'Desarrollo', hours: 40 }] },
          ] }],
        },
      },
    });
    expect(withQuotationTeamEdit(ai, dev, { duration: 5 })).toBe(ai);
    expect(ai.teams).toHaveLength(0);
  });
});
