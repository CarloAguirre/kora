import { describe, expect, it } from 'vitest';
import { quotationDraftDataSchema, quotationReferenceEdtSchema } from '@kora/contracts';
import { buildQuotationTransferReferences } from './quotation-transfer-references';

const dev = '0777e456-fd76-445e-83f1-afc25061c101';
const qa = '0777e456-fd76-445e-83f1-afc25061c102';
const one = '0777e456-fd76-445e-83f1-afc25061c103';
const two = '0777e456-fd76-445e-83f1-afc25061c104';
const teams = [dev, qa].map(teamId => ({
  teamId, collaborators: 1, unit: 'week' as const,
  duration: 2, hoursPerWeek: 40, dedicationPercent: 100,
}));
const phase = { name:'Desarrollo', startWeek:2, durationWeeks:3,
  teamHours:[{teamId:dev,hours:10},{teamId:qa,hours:6}] };

describe('Referencias comerciales sin afectar Roadmap', () => {
  it('conserva bloques por equipo en semanas relativas y no crea fechas', () => {
    const draft = quotationDraftDataSchema.parse({
      mode:'phases', teams, phases:[phase],
    });
    const view = buildQuotationTransferReferences(draft,
      [{moduleId:one,name:'Desarrollo',totalHours:16}]);
    expect(view.modules[0]?.relativeTeamBlocks).toEqual([
      {teamId:dev,hours:10,startWeek:2,durationWeeks:3},
      {teamId:qa,hours:6,startWeek:2,durationWeeks:3},
    ]);
    expect(view.modules[0]?.tasks).toEqual([]);
    expect(JSON.stringify(view)).not.toMatch(/startDate|endDate|assigneeUserId/);
  });
  it('conserva WBS y HH de la EDT, incluidas tareas comerciales añadidas', () => {
    const edt = quotationReferenceEdtSchema.parse({
      schemaVersion:'kora.quotation.reference-edt.v2',
      source:'kdm_demo',provider:'gemini',
      totalHours:10,reservePercent:0,reserveHours:0,totalWithReserve:10,
      stages:[{code:'T01',name:'Desarrollo',startWeek:2,durationWeeks:3,totalHours:10}],
      modules:[{name:'Desarrollo',totalHours:10,tasks:[{
        wbs:'T01.01',name:'Servicio REST',description:'API interna',
        role:'Backend',hours:10,stageCode:'T01',
        roleEffort:[{role:'Backend',hours:10}],
      }]}],
    });
    const stage = 'KS-0777e456-fd76-445e-83f1-afc25061c105';
    const draft = quotationDraftDataSchema.parse({
      mode:'phases',teams,phases:[phase,{name:'QA comercial',startWeek:4,
        durationWeeks:1,teamHours:[{teamId:qa,hours:5}]}],
      aiPoc: {source:'kdm_demo',
        proposal:{},answers:[],dynamicQuestions:[],edt,
        roleTeamIds:{Backend:dev}},
      edtCommercialStages:[{code:stage,name:'QA comercial',startWeek:4,durationWeeks:1}],
      edtCommercialTasks:[{
        wbs:'KT-0777e456-fd76-445e-83f1-afc25061c106',
        stageCode:stage,name:'UAT adicional',teamId:qa,hours:5,fixed:false,
      }],
    });
    const view = buildQuotationTransferReferences(draft,[
      {moduleId:one,name:'Desarrollo',totalHours:10},
      {moduleId:two,name:'QA comercial',totalHours:5},
    ]);
    expect(view.modules[0]?.tasks[0]).toMatchObject({
      wbs:'T01.01',name:'Servicio REST',hours:10,role:'Backend',
    });
    expect(view.modules[1]?.tasks[0]).toMatchObject({
      name:'UAT adicional',hours:5,role:'Tarea comercial',
    });
    expect(view.unassignedTasks).toEqual([]);
  });
});
