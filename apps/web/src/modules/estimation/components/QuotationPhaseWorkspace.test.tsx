import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { quotationReferenceEdtSchema, type QuotationDraftData } from '@kora/contracts';
import { QuotationPhaseWorkspace, referenceTasksForPhase } from './QuotationPhaseWorkspace';

const devId = '0777e456-fd76-445e-83f1-afc25061c103';
const qaId = '0777e456-fd76-445e-83f1-afc25061c104';
const teams: QuotationDraftData['teams'] = [
  { teamId: devId, collaborators: 2, unit: 'week', duration: 2,
    hoursPerWeek: 40, dedicationPercent: 100 },
  { teamId: qaId, collaborators: 1, unit: 'week', duration: 1,
    hoursPerWeek: 40, dedicationPercent: 100 },
];
const teamNames = new Map([[devId, 'Desarrollo'], [qaId, 'QA']]);
const mapping = { Fullstack: devId, Tester: qaId };
const phases: QuotationDraftData['phases'] = [
  { name: 'T01 · Portal de cliente', startWeek: 1, durationWeeks: 2,
    teamHours: [{ teamId: devId, hours: 12 }, { teamId: qaId, hours: 3 }] },
  { name: 'T02 · Entrega', startWeek: 3, durationWeeks: 1,
    teamHours: [{ teamId: qaId, hours: 8 }] },
];
const edt = quotationReferenceEdtSchema.parse({
  schemaVersion: 'kora.quotation.reference-edt.v2',
  source: 'kdm_demo', provider: 'gemini', totalHours: 23,
  reservePercent: 0, reserveHours: 0, totalWithReserve: 23,
  stages: [
    { code: 'T01', name: 'Portal de cliente', startWeek: 1,
      durationWeeks: 2, totalHours: 15 },
    { code: 'T02', name: 'Entrega', startWeek: 3,
      durationWeeks: 1, totalHours: 8 },
  ],
  modules: [
    { name: 'Portal', totalHours: 15, tasks: [
      { wbs: 'T01.01', name: 'Integración SAP', description: 'Servicio SOAP Facele.',
        role: 'Fullstack', hours: 15, stageCode: 'T01', classification: 'Integración',
        referenceIds: ['R09'],
        roleEffort: [
          { role: 'Fullstack', hours: 12 },
          { role: 'Tester', hours: 3 },
        ],
      },
    ] },
    { name: 'QA', totalHours: 8, tasks: [
      { wbs: 'T02.01', name: 'Validar entregables', description: 'UAT.',
        role: 'Tester', hours: 8, stageCode: 'T02',
        roleEffort: [{ role: 'Tester', hours: 8 }],
      },
    ] },
  ],
});
const callbacks = {
  onEditPhase: vi.fn(), onAddPhase: vi.fn(), onRemovePhase: vi.fn(),
};
const renderEditor = (customPhases: QuotationDraftData['phases'] = phases) =>
  render(<QuotationPhaseWorkspace
    phases={customPhases} teams={teams} edt={edt}
    teamNames={teamNames} roleTeamIds={mapping}
    editable onEditPhase={callbacks.onEditPhase}
    onAddPhase={callbacks.onAddPhase} onRemovePhase={callbacks.onRemovePhase} />);

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('Cotización v5 · fases y módulos', () => {
  it('conserva WBS×perfil sin duplicar HH dentro del módulo y usa el equipo real', () => {
    const rows = referenceTasksForPhase(phases[0]!, edt, mapping, teamNames);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.team)).toEqual(['Desarrollo', 'QA']);
    expect(rows.map((row) => row.hours)).toEqual([12, 3]);
    expect(rows.reduce((sum, row) => sum + row.hours, 0)).toBe(15);
    expect(rows[0]?.wbs).toBe('T01.01');
    expect(rows[0]?.references).toEqual(['R09']);
  });

  it('representa las tarjetas, tareas, roadmap y conserva las HH comerciales editables', () => {
    renderEditor();
    expect(screen.getByText('Fases · Módulos')).toBeInTheDocument();
    expect(screen.getByText('Fase 2')).toBeInTheDocument();
    expect(screen.getByText('Fase 3')).toBeInTheDocument();
    expect(screen.getByText('15 HH · semanas 1 a 2')).toBeInTheDocument();
    expect(screen.getByText('Roadmap preliminar')).toBeInTheDocument();
    expect(screen.getByLabelText('T01 · Portal de cliente, semanas 1 a 2')).toBeInTheDocument();
    expect(screen.getAllByText('Integración SAP')).toHaveLength(2);
    expect(screen.getAllByText(/Propuesta del agente/).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('HH de Desarrollo para fase 2'),
      { target: { value: '18' } });
    expect(callbacks.onEditPhase).toHaveBeenCalledWith(0, {
      teamHours: [{ teamId: qaId, hours: 3 }, { teamId: devId, hours: 18 }],
    });
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar fase / módulo' }));
    expect(callbacks.onAddPhase).toHaveBeenCalledOnce();
  });

  it('alerta si la fase comercial ya no concilia con las tareas IA', () => {
    const changed = [
      { ...phases[0]!, teamHours: [{ teamId: devId, hours: 20 }] },
    ];
    renderEditor(changed);
    expect(screen.getByText(/La fase comercial suma/)).toBeInTheDocument();
    expect(screen.getByText(/EDT de referencia 15 HH/)).toBeInTheDocument();
  });

  it('no elimina fases sin confirmación explícita y no crea tareas ejecutables', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderEditor();
    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0]!);
    expect(callbacks.onRemovePhase).not.toHaveBeenCalled();
    expect(screen.getAllByLabelText('Fija no disponible para T01.01')).toHaveLength(2);
    expect(screen.getAllByLabelText('Fija no disponible para T01.01').every(
      (element) => element.hasAttribute('disabled'))).toBe(true);
    expect(screen.queryByRole('button', { name: /Crear tarea operativa/ })).not.toBeInTheDocument();
  });
});
