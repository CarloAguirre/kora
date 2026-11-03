import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { quotationDraftDataSchema } from '@kora/contracts';
import { QuotationTeamsWorkspace } from './QuotationTeamsWorkspace';

const dev = '0777e456-fd76-445e-83f1-afc25061c103';
const qa = '0777e456-fd76-445e-83f1-afc25061c104';
const names = new Map([[dev, 'Desarrollo'], [qa, 'QA']]);
const activeTeams = [{ id: dev, name: 'Desarrollo' }, { id: qa, name: 'QA' }];
const handlers = {
  onChangeView: vi.fn(), onEditTeam: vi.fn(), onToggleTeam: vi.fn(),
  onEditGroupHours: vi.fn(), onEditRoleCollaborators: vi.fn(),
  onEditMappedCollaborators: vi.fn(),
};
const team = (id: string) => ({
  teamId: id, collaborators: 2, unit: 'week' as const,
  duration: 2, hoursPerWeek: 40, dedicationPercent: 100,
});
const manual = quotationDraftDataSchema.parse({
  mode: 'team', teams: [team(dev)], phases: [],
});
const edtDraft = quotationDraftDataSchema.parse({
  mode: 'team',
  aiPoc: {
    source: 'kdm_demo', answers: [], roleTeamIds: {},
    proposal: {
      projectId: '0777e456-fd76-445e-83f1-afc25061c100',
      provider: 'gemini', sourceMode: 'poc_simulated',
      documentsAnalyzed: 1, summary: 'Propuesta',
      roles: [
        { role: 'Desarrollo', unit: 'week', duration: 2,
          hoursPerUnit: 20, people: 1, totalHours: 40 },
      ], totalHours: 40, assumptions: [], clarifyingQuestions: [],
    },
    edt: {
      schemaVersion: 'kora.quotation.reference-edt.v2',
      source: 'kdm_demo', provider: 'gemini',
      totalHours: 40, reservePercent: 0, reserveHours: 0, totalWithReserve: 40,
      stages: [{ code: 'S1', name: 'Portal', startWeek: 1, durationWeeks: 2,
        totalHours: 40 }],
      modules: [{ name: 'Portal', totalHours: 40, tasks: [{
        wbs: 'S1.01', name: 'API', description: 'Servicio',
        role: 'Desarrollo', hours: 40, stageCode: 'S1',
        roleEffort: [{ role: 'Desarrollo', hours: 40 }],
      }] }],
    },
  },
});
const mappedEdtDraft = quotationDraftDataSchema.parse({
  ...edtDraft, mode: 'phases', teams: [team(dev)],
  aiPoc: { ...edtDraft.aiPoc!, roleTeamIds: { Desarrollo: dev } },
});
const renderTeams = (draft: typeof manual, view: 'team' | 'phases' = 'team') =>
  render(<QuotationTeamsWorkspace
    draft={draft} editable teamNames={names} activeTeams={activeTeams}
    view={view} {...handlers}/>);

describe('Switch Equipos · HTML v5', () => {
  it('es un único switch, con estado seleccionado sin perder HH del borrador', () => {
    renderTeams(edtDraft, 'phases');
    const group = screen.getByRole('radiogroup', { name: 'Vista de equipos' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Por fases y módulos' }))
      .toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Por equipo' }));
    expect(handlers.onChangeView).toHaveBeenCalledWith('team');
    expect(screen.queryByText('Ajustes avanzados de equipos')).not.toBeInTheDocument();
  });

  it('muestra HH derivadas del EDT, editables globalmente, sin capacidad artificial', () => {
    renderTeams(mappedEdtDraft);
    expect(screen.getByLabelText('Horas totales de Desarrollo')).toHaveValue(40);
    expect(screen.queryByText('Unidad')).not.toBeInTheDocument();
    expect(screen.queryByText('Duración')).not.toBeInTheDocument();
    expect(screen.getByText('Semanas')).toBeInTheDocument();
    expect(screen.getByText('HH/sem equipo')).toBeInTheDocument();
    expect(screen.getByText('HH/sem/colab.')).toBeInTheDocument();
    expect(screen.getByLabelText('Carga semanal por colaborador de Desarrollo'))
      .toHaveTextContent('20');
    expect(screen.getByText('S1–S2')).toBeInTheDocument();
    expect(screen.getByText('2 sem. activas')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Distribución semanal orientativa' }))
      .toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'S1' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'S2' })).toBeInTheDocument();
    const groupHours = screen.getByLabelText('Horas totales de Desarrollo');
    fireEvent.change(groupHours, { target: { value: '38' } });
    expect(handlers.onEditGroupHours).not.toHaveBeenCalled();
    fireEvent.blur(groupHours);
    expect(handlers.onEditGroupHours).toHaveBeenCalledWith(dev, 38);
    fireEvent.change(screen.getByLabelText('Colaboradores de Desarrollo'),
      { target: { value: '3' } });
    expect(handlers.onEditMappedCollaborators).toHaveBeenCalledWith(dev, 3);
  });

  it('separa perfiles pendientes de equipos reales, sin matriz semanal ficticia', () => {
    renderTeams(edtDraft);
    expect(screen.getByRole('region', { name: 'Perfiles IA pendientes de asignación' }))
      .toBeInTheDocument();
    expect(screen.getByText('Perfiles IA sin equipo Kora')).toBeInTheDocument();
    expect(screen.queryByLabelText('Horas totales de Desarrollo')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Distribución semanal orientativa' }))
      .not.toBeInTheDocument();
    expect(screen.getByText(/La distribución por equipos se habilitará/))
      .toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Colaboradores de Desarrollo'),
      { target: { value: '3' } });
    expect(handlers.onEditRoleCollaborators).toHaveBeenCalledWith('Desarrollo', 3);
  });

  it('pagina ocho semanas sin inventar carga ni perder las semanas restantes', () => {
    const extended = quotationDraftDataSchema.parse({
      ...mappedEdtDraft,
      edtStageSettings: [{
        stageCode: 'S1', name: 'Portal', startWeek: 1, durationWeeks: 10,
      }],
    });
    renderTeams(extended);
    expect(screen.getByRole('columnheader', { name: 'S1' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'S8' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'S9' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semanas anteriores' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Semanas siguientes' }));
    expect(screen.getByRole('columnheader', { name: 'S9' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'S10' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semanas siguientes' })).toBeDisabled();
  });

  it('mantiene el detalle semanal solo en Por equipo, sin duplicarlo en fases', () => {
    renderTeams(edtDraft, 'phases');
    expect(screen.queryByRole('region', { name: 'Distribución semanal orientativa' }))
      .not.toBeInTheDocument();
  });

  it('en cotización manual por fases no ofrece capacidad que no determina las HH', () => {
    const phasesDraft = quotationDraftDataSchema.parse({
      mode: 'phases', teams: [team(dev)], phases: [{
        name: 'Construcción', startWeek: 2, durationWeeks: 2,
        teamHours: [{ teamId: dev, hours: 30 }],
      }],
    });
    renderTeams(phasesDraft);
    expect(screen.getByText('Semanas')).toBeInTheDocument();
    expect(screen.getByText('S2–S3')).toBeInTheDocument();
    expect(screen.queryByText('Dedicación')).not.toBeInTheDocument();
    expect(screen.queryByText('Unidad')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Distribución semanal orientativa' }))
      .toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'S3' })).toBeInTheDocument();
  });

  it('en una estimación manual, edita colaboradores, unidad, duración y dedicación directamente', () => {
    renderTeams(manual);
    expect(screen.getByText('Unidad')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Unidad de Desarrollo'),
      { target: { value: 'day' } });
    expect(handlers.onEditTeam).toHaveBeenCalledWith(dev, { unit: 'day' });
    fireEvent.change(screen.getByLabelText('Duración de Desarrollo'),
      { target: { value: '4' } });
    expect(handlers.onEditTeam).toHaveBeenCalledWith(dev, { duration: 4 });
    fireEvent.click(screen.getByLabelText('Incluir QA'));
    expect(handlers.onToggleTeam).toHaveBeenCalledWith(qa, true);
  });
});
