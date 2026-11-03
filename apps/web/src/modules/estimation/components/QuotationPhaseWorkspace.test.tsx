import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { quotationDraftDataSchema, quotationReferenceEdtSchema } from '@kora/contracts';
import { QuotationPhaseWorkspace, referenceTasksForPhase, referencePhasesFromEdt } from './QuotationPhaseWorkspace';

const dev = '0777e456-fd76-445e-83f1-afc25061c103';
const qa = '0777e456-fd76-445e-83f1-afc25061c104';
const teams = new Map([[dev, 'Desarrollo'], [qa, 'QA']]);
const edt = quotationReferenceEdtSchema.parse({
  schemaVersion: 'kora.quotation.reference-edt.v2',
  source: 'kdm_demo', provider: 'gemini',
  totalHours: 23, reservePercent: 0, reserveHours: 0, totalWithReserve: 23,
  stages: [
    { code: 'T01', name: 'Portal', startWeek: 1, durationWeeks: 2, totalHours: 15 },
    { code: 'T02', name: 'Pruebas', startWeek: 3, durationWeeks: 1, totalHours: 8 },
  ],
  modules: [
    { name: 'Portal', totalHours: 15, tasks: [{
      wbs: 'T01.01', name: 'Integración SAP', description: 'Servicio SOAP',
      role: 'Fullstack', hours: 15, stageCode: 'T01',
      roleEffort: [{ role: 'Fullstack', hours: 12 }, { role: 'Tester', hours: 3 }],
      referenceIds: ['R09'],
    }] },
    { name: 'QA', totalHours: 8, tasks: [{
      wbs: 'T02.01', name: 'UAT', description: 'Pruebas',
      role: 'Tester', hours: 8, stageCode: 'T02',
      roleEffort: [{ role: 'Tester', hours: 8 }],
    }] },
  ],
});
const draft = quotationDraftDataSchema.parse({
  mode: 'team',
  teams: [],
  aiPoc: {
    source: 'kdm_demo', edt, roleTeamIds: {}, answers: [],
    proposal: {
      projectId: '0777e456-fd76-445e-83f1-afc25061c101',
      provider: 'gemini', sourceMode: 'poc_simulated',
      documentsAnalyzed: 1, summary: 'Propuesta',
      roles: [
        { role: 'Fullstack', unit: 'week', duration: 2,
          hoursPerUnit: 12, people: 1, totalHours: 24 },
        { role: 'Tester', unit: 'week', duration: 1,
          hoursPerUnit: 11, people: 1, totalHours: 11 },
      ],
      totalHours: 35, assumptions: [], clarifyingQuestions: [],
    },
  },
});
const callbacks = {
  onEditPhase: vi.fn(), onAddPhase: vi.fn(), onRemovePhase: vi.fn(),
  onEditTaskHours: vi.fn(), onEditTaskFixed: vi.fn(), onEditTaskTeam: vi.fn(),
  onEditGroupHours: vi.fn(), onEditStage: vi.fn(),
};
function renderEditor(custom = draft) {
  return render(<QuotationPhaseWorkspace
    phases={custom.phases} teams={custom.teams} edt={edt}
    draft={custom} teamNames={teams} roleTeamIds={custom.aiPoc?.roleTeamIds}
    activeTeams={[{ id: dev, name: 'Desarrollo' }, { id: qa, name: 'QA' }]}
    editable commercialMode={custom.mode}
    {...callbacks}/>);
}
afterEach(() => vi.clearAllMocks());

describe('Cotización HTML v5 · fases y tareas', () => {
  it('muestra módulos y roadmap aun sin fases comerciales ni equipos mapeados', () => {
    renderEditor();
    expect(screen.getByText('Fases · Módulos')).toBeInTheDocument();
    expect(screen.getByText('Fase 2')).toBeInTheDocument();
    expect(screen.getByText('Fase 3')).toBeInTheDocument();
    expect(screen.getByText('Roadmap preliminar')).toBeInTheDocument();
    expect(screen.getByText('15 HH · semanas 1 a 2')).toBeInTheDocument();
    expect(screen.queryByText(/Planificación propuesta por Gemini/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Fase 1 la crea Kora/)).not.toBeInTheDocument();
  });

  it('muestra grilla de cuatro columnas; equipo seleccionable, HH editable y Fija real', () => {
    renderEditor();
    expect(screen.getAllByText('Tarea')).toHaveLength(2);
    expect(screen.getAllByText('Equipo')).toHaveLength(2);
    expect(screen.getAllByText('Fija')).toHaveLength(2);
    expect(screen.queryByText('Tipo (catálogo)')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Equipo de T01.01 · Fullstack'),
      { target: { value: dev } });
    expect(callbacks.onEditTaskTeam).toHaveBeenCalledWith('T01.01', 'Fullstack', dev);
    fireEvent.click(screen.getByLabelText('Fija para T01.01 · Fullstack'));
    expect(callbacks.onEditTaskFixed).toHaveBeenCalledWith('T01.01', 'Fullstack', true);
    fireEvent.change(screen.getByLabelText('HH de T01.01 · Fullstack'),
      { target: { value: '15.5' } });
    expect(callbacks.onEditTaskHours).toHaveBeenCalledWith('T01.01', 'Fullstack', 15.5);
  });

  it('bloquea el input HH de las tareas marcadas como Fija', () => {
    const fixedDraft = quotationDraftDataSchema.parse({
      ...draft,
      edtTaskSettings: [{ wbs: 'T01.01', role: 'Fullstack', fixed: true }],
    });
    renderEditor(fixedDraft);
    expect(screen.getByLabelText('Fija para T01.01 · Fullstack')).toBeChecked();
    expect(screen.getByLabelText('HH de T01.01 · Fullstack')).toBeDisabled();
    expect(screen.getByLabelText('HH de T01.01 · Tester')).toBeEnabled();
  });

  it('permite modificar HH por perfil y fase; recalcular se delega a contratos', () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText('HH de Fullstack para fase 2'),
      { target: { value: '10' } });
    expect(callbacks.onEditGroupHours).toHaveBeenCalledWith(
      'profile:Fullstack', 10, 'T01', undefined);
    fireEvent.change(screen.getByDisplayValue('Portal'),
      { target: { value: 'Portal postventa' } });
    expect(callbacks.onEditStage).toHaveBeenCalledWith(
      'T01', { name: 'Portal postventa' });
  });

  it('agrega y elimina módulos manuales sin EDT, conservando acciones históricas', () => {
    const manual = quotationDraftDataSchema.parse({ mode: 'phases',
      phases: [{ name: 'Producción', startWeek: 1, durationWeeks: 2, teamHours: [] }] });
    render(<QuotationPhaseWorkspace
      phases={manual.phases} teams={[]} editable teamNames={teams}
      onEditPhase={callbacks.onEditPhase}
      onAddPhase={callbacks.onAddPhase} onRemovePhase={callbacks.onRemovePhase}/>);
    fireEvent.click(screen.getByRole('button', { name: /Agregar fase/ }));
    expect(callbacks.onAddPhase).toHaveBeenCalledOnce();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(callbacks.onRemovePhase).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('mantiene HH por perfil y WBS al representar un mismo trabajo multiperfil', () => {
    const stages = referencePhasesFromEdt(edt, {}, teams, draft);
    expect(stages).toHaveLength(2);
    const rows = referenceTasksForPhase(stages[0]!, edt, {}, teams, draft);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.hours)).toEqual([12, 3]);
    expect(rows.reduce((sum, row) => sum + row.hours, 0)).toBe(15);
  });
});
