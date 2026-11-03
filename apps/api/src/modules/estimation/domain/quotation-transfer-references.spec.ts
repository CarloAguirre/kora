import { describe, expect, it } from 'vitest';
import { quotationDraftDataSchema, quotationReferenceEdtSchema, type QuotationDraftData } from '@kora/contracts';
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
    const draft: QuotationDraftData = {
      ...quotationDraftDataSchema.parse({
        mode:'phases',teams,phases:[phase,{name:'QA comercial',startWeek:4,
          durationWeeks:1,teamHours:[{teamId:qa,hours:5}]}],
        edtCommercialStages:[{code:stage,name:'QA comercial',startWeek:4,durationWeeks:1}],
        edtCommercialTasks:[{
          wbs:'KT-0777e456-fd76-445e-83f1-afc25061c106',
          stageCode:stage,name:'UAT adicional',teamId:qa,hours:5,fixed:false,
        }],
      }),
      aiPoc: { source:'kdm_demo', proposal:{roles:[]},
        answers:[],dynamicQuestions:[],edt,
        roleTeamIds:{Backend:dev} } as unknown as QuotationDraftData['aiPoc'],
    };
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
  it('asocia una fase S1 · del traspaso a su etapa EDT sin dejar tareas huérfanas', () => {
    const edt = quotationReferenceEdtSchema.parse({
      schemaVersion:'kora.quotation.reference-edt.v2', source:'kdm_demo', provider:'gemini',
      totalHours:10, reservePercent:0, reserveHours:0, totalWithReserve:10,
      stages:[{code:'S1',name:'Diseño y Arquitectura UI/UX',startWeek:1,durationWeeks:2,totalHours:10}],
      modules:[{name:'Componentes de experiencia', totalHours:10, tasks:[{
        wbs:'S1.01',name:'Diseñar flujos',role:'UX',description:'',
        hours:10,stageCode:'S1',roleEffort:[{role:'UX',hours:10}],
      }]}],
    });
    const draft: QuotationDraftData = {
      ...quotationDraftDataSchema.parse({mode:'phases',teams,
        phases:[{...phase,name:'S1 · Diseño y Arquitectura UI/UX'}]}),
      aiPoc:{source:'kdm_demo',proposal:{roles:[]},answers:[],dynamicQuestions:[],
        edt,roleTeamIds:{UX:dev}} as unknown as QuotationDraftData['aiPoc'],
    };
    const result=buildQuotationTransferReferences(draft,[
      {moduleId:one,name:'S1 · Diseño y Arquitectura UI/UX',totalHours:10},
    ]);
    expect(result.modules[0]?.tasks.map(t=>t.wbs)).toEqual(['S1.01']);
    expect(result.unassignedTasks).toEqual([]);
  });
  it('no asigna una tarea a dos fases ambiguas', () => {
    const draft = quotationDraftDataSchema.parse({mode:'phases',teams,phases:[phase]});
    const result=buildQuotationTransferReferences(draft,[
      {moduleId:one,name:'Desarrollo',totalHours:8},
      {moduleId:two,name:'Desarrollo',totalHours:8},
    ]);
    expect(result.modules.every(module=>module.tasks.length===0)).toBe(true);
  });
});
