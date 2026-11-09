import { describe, expect, it } from 'vitest';
import { quotationDraftDataSchema, quotationReferenceEdtSchema, type QuotationDraftData } from '@kora/contracts';
import { buildQuotationTransferReferences, matchingCopiedQuotationReferenceSource } from './quotation-transfer-references';

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
  it('vincula STG-01 y TL-GOV sin cortar los códigos por el guion', () => {
    const edt = quotationReferenceEdtSchema.parse({
      schemaVersion: 'kora.quotation.reference-edt.v2',source:'drive',provider:'gemini',
      totalHours:16,reservePercent:0,reserveHours:0,totalWithReserve:16,
      stages:[
        {code:'STG-01',name:'Descubrimiento y Arquitectura Base',
          startWeek:1,durationWeeks:2,totalHours:10},
        {code:'TL-GOV',name:'Supervisión transversal',
          startWeek:1,durationWeeks:8,totalHours:6},
      ],
      modules:[{name:'Diseño y gobernanza',totalHours:16,tasks:[
        {wbs:'STG-01.01',name:'Definir arquitectura',description:'',
          role:'Backend',hours:10,stageCode:'STG-01',roleEffort:[{role:'Backend',hours:10}]},
        {wbs:'TL-GOV.01',name:'Seguimiento transversal',description:'',
          role:'PM',hours:6,stageCode:'TL-GOV',roleEffort:[{role:'PM',hours:6}]},
      ]}],
    });
    const draft: QuotationDraftData = {
      ...quotationDraftDataSchema.parse({mode:'phases',teams,phases:[
        {name:'STG-01 · Descubrimiento y Arquitectura Base',startWeek:1,
          durationWeeks:2,teamHours:[{teamId:dev,hours:10}]},
        {name:'TL-GOV · Supervisión transversal',startWeek:1,
          durationWeeks:8,teamHours:[{teamId:qa,hours:6}]},
      ]}),
      aiPoc:{source:'drive',proposal:{roles:[]},answers:[],dynamicQuestions:[],edt,
        roleTeamIds:{Backend:dev,PM:qa}} as unknown as QuotationDraftData['aiPoc'],
    };
    const refs=buildQuotationTransferReferences(draft,[
      {moduleId:one,name:'STG-01 · Descubrimiento y Arquitectura Base',totalHours:10},
      {moduleId:two,name:'TL-GOV · Supervisión transversal',totalHours:6},
    ]);
    expect(refs.modules[0]?.tasks.map((row) => row.wbs)).toEqual(['STG-01.01']);
    expect(refs.modules[1]?.tasks.map((row) => row.wbs)).toEqual(['TL-GOV.01']);
    expect(refs.unassignedTasks).toEqual([]);
  });


  it('transfiere una WBS compartida con entregables UX/UI y Desarrollo distintos', () => {
    const edt = quotationReferenceEdtSchema.parse({
      schemaVersion: 'kora.quotation.reference-edt.v2', source: 'drive',
      provider: 'gemini', totalHours: 64, reservePercent: 0,
      reserveHours: 0, totalWithReserve: 64,
      stages: [{ code: 'STG-01', name: 'Interfaz de usuarios',
        startWeek: 1, durationWeeks: 2, totalHours: 64 }],
      modules: [{
        name: 'Experiencia de usuario', totalHours: 64,
        tasks: [{
          wbs: 'STG-01.01', name: 'Diseñar e implementar interfaz',
          description: 'Entregar experiencia funcional de usuario.',
          role: 'Desarrollo', hours: 64, stageCode: 'STG-01',
          roleEffort: [
            { role: 'UX/UI', hours: 24,
              taskName: 'Diseñar flujos, pantallas y prototipo en Figma',
              taskDescription: 'Entregar prototipo navegable y especificaciones visuales.' },
            { role: 'Desarrollo', hours: 40,
              taskName: 'Implementar interfaz conectada a la API',
              taskDescription: 'Construir componentes React, validaciones y conexión API.' },
          ],
        }],
      }],
    });
    const draft: QuotationDraftData = {
      ...quotationDraftDataSchema.parse({
        mode: 'phases', teams,
        phases: [{ name: 'STG-01 · Interfaz de usuarios', startWeek: 1,
          durationWeeks: 2, teamHours: [
            { teamId: qa, hours: 24 }, { teamId: dev, hours: 40 },
          ] }],
      }),
      aiPoc: { source: 'drive', proposal: { roles: [] },
        answers: [], dynamicQuestions: [], edt,
        roleTeamIds: { 'UX/UI': qa, Desarrollo: dev } } as unknown as QuotationDraftData['aiPoc'],
    };
    const projected = buildQuotationTransferReferences(draft, [
      { moduleId: one, name: 'STG-01 · Interfaz de usuarios', totalHours: 64 },
    ]);
    const rows = projected.modules[0]!.tasks;
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.role, row.name, row.description, row.hours]))
      .toEqual([
        ['UX/UI', 'Diseñar flujos, pantallas y prototipo en Figma',
          'Entregar prototipo navegable y especificaciones visuales.', 24],
        ['Desarrollo', 'Implementar interfaz conectada a la API',
          'Construir componentes React, validaciones y conexión API.', 40],
      ]);
    expect(rows[0]!.wbs).toBe(rows[1]!.wbs);
    expect(rows.reduce((total, row) => total + row.hours, 0)).toBe(64);
    expect(projected.unassignedTasks).toEqual([]);
    // La evidencia Gemini conserva el propósito compartido, no se reescribe.
    expect(draft.aiPoc?.edt?.modules[0]?.tasks[0]?.name)
      .toBe('Diseñar e implementar interfaz');
  });

  it('recupera referencias de copia solo con etapas, equipos y HH iguales', () => {
    const edt = quotationReferenceEdtSchema.parse({
      schemaVersion:'kora.quotation.reference-edt.v2',source:'drive',provider:'gemini',
      totalHours:16,reservePercent:0,reserveHours:0,totalWithReserve:16,
      stages:[{code:'STG-01',name:'Desarrollo',startWeek:2,durationWeeks:3,totalHours:16}],
      modules:[{name:'Desarrollo',totalHours:16,tasks:[{
        wbs:'STG-01.01',name:'Servicio REST',description:'API interna',
        role:'Backend',hours:16,stageCode:'STG-01',
        roleEffort:[{role:'Backend',hours:16}],
      }]}],
    });
    const source:QuotationDraftData = {
      ...quotationDraftDataSchema.parse({mode:'phases',teams,phases:[{
        name:'STG-01 · Desarrollo',startWeek:2,durationWeeks:3,
        teamHours:[{teamId:dev,hours:10},{teamId:qa,hours:6}],
      }]}),
      aiPoc:{source:'drive',proposal:{roles:[]},answers:[],dynamicQuestions:[],edt,
        roleTeamIds:{Backend:dev}} as unknown as QuotationDraftData['aiPoc'],
    };
    const copied=quotationDraftDataSchema.parse({...source,aiPoc:null,
      sourceRefs:[],answers:{},analysisProjectionStatus:undefined});
    expect(matchingCopiedQuotationReferenceSource(copied,source,16,16)).toBe(true);
    expect(matchingCopiedQuotationReferenceSource(copied,source,16,17)).toBe(false);
    expect(matchingCopiedQuotationReferenceSource(copied,{...source,aiPoc:null},16,16))
      .toBe(false);
    const edited=quotationDraftDataSchema.parse({
      ...copied,phases:[{...copied.phases[0]!,teamHours:[
        {teamId:dev,hours:9},{teamId:qa,hours:7},
      ]}],
    });
    expect(matchingCopiedQuotationReferenceSource(edited,source,16,16)).toBe(false);
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
