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
      roles: [{ role: 'Desarrollador Backend', unit: 'week', duration: 2,
        hoursPerUnit: 20, people: 1, totalHours: 40 }],
      totalHours: 40, assumptions: [], clarifyingQuestions: [],
    },
    edt: {
      schemaVersion: 'kora.quotation.reference-edt.v2',
      source: 'kdm_demo', provider: 'gemini',
      totalHours: 40, reservePercent: 0, reserveHours: 0, totalWithReserve: 40,
      stages: [{ code: 'S1', name: 'Portal', startWeek: 1, durationWeeks: 2,
        totalHours: 40 }],
      modules: [{ name: 'Portal', totalHours: 40, tasks: [{
        wbs: 'S1.01', name: 'API', description: 'Servicio',
        role: 'Desarrollador Backend', hours: 40, stageCode: 'S1',
        roleEffort: [{ role: 'Desarrollador Backend', hours: 40 }],
      }] }],
    },
  },
});
const mappedEdtDraft = quotationDraftDataSchema.parse({
  ...edtDraft, mode: 'phases', teams: [team(dev)],
  aiPoc: {
    ...edtDraft.aiPoc!,
    roleTeamIds: { 'Desarrollador Backend': dev },
  },
});
const renderTeams = (draft: typeof manual, view: 'team' | 'phases' = 'team') =>
  render(<QuotationTeamsWorkspace
    draft={draft} editable teamNames={names} activeTeams={activeTeams}
    view={view} {...handlers}/>);

describe('Equipos · fuente visual prototipo HTML v5', () => {
  it('presenta un único switch continuo y conserva la EDT al alternarlo', () => {
    renderTeams(mappedEdtDraft, 'phases');
    const group = screen.getByRole('radiogroup', { name: 'Vista de equipos' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Por fases y módulos' }))
      .toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Por equipo' }));
    expect(handlers.onChangeView).toHaveBeenCalledWith('team');
  });

  it('en Por equipo muestra siete columnas y solo equipos del catálogo, nunca perfiles como equipos', () => {
    renderTeams(mappedEdtDraft);
    expect(screen.getByText('Unidad')).toBeInTheDocument();
    expect(screen.getByText('Duración')).toBeInTheDocument();
    expect(screen.getByText('hh/sem')).toBeInTheDocument();
    expect(screen.getByText('Dedicación')).toBeInTheDocument();
    expect(screen.getByLabelText('Incluir Desarrollo')).toBeChecked();
    expect(screen.getByLabelText('Incluir QA')).not.toBeChecked();
    expect(screen.getByLabelText('Horas totales de Desarrollo')).toHaveValue(40);
    expect(screen.getByLabelText('Unidad de Desarrollo')).toBeDisabled();
    expect(screen.queryByText('Desarrollador Backend')).not.toBeInTheDocument();
    expect(screen.queryByText('Carga semanal por equipo')).not.toBeInTheDocument();
    const input = screen.getByLabelText('Horas totales de Desarrollo');
    fireEvent.change(input, { target: { value: '38' } });
    expect(handlers.onEditGroupHours).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(handlers.onEditGroupHours).toHaveBeenCalledWith(dev, 38);
  });

  it('en Por fases y módulos agrupa HH en los equipos reales con tres columnas', () => {
    renderTeams(mappedEdtDraft, 'phases');
    expect(screen.getByText('Nº colab.')).toBeInTheDocument();
    expect(screen.getByLabelText('Horas totales de Desarrollo')).toHaveValue(40);
    expect(screen.queryByText('Unidad')).not.toBeInTheDocument();
    expect(screen.queryByText('Duración')).not.toBeInTheDocument();
    expect(screen.queryByText('Carga semanal por equipo')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Colaboradores de Desarrollo'),
      { target: { value: '3' } });
    expect(handlers.onEditMappedCollaborators).toHaveBeenCalledWith(dev, 3);
  });

  it('no presenta los perfiles huérfanos como equipos y mantiene sus HH trazables', () => {
    renderTeams(edtDraft, 'phases');
    expect(screen.getByText('Perfiles IA sin equipo Kora')).toBeInTheDocument();
    expect(screen.getByText('Desarrollador Backend')).toBeInTheDocument();
    expect(screen.getByText('40 HH propuestas')).toBeInTheDocument();
    expect(screen.queryByLabelText('Horas totales de Desarrollo')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Colaboradores de Desarrollador Backend'),
      { target: { value: '3' } });
    expect(handlers.onEditRoleCollaborators).toHaveBeenCalledWith('Desarrollador Backend', 3);
  });

  it('conserva el modo manual y habilita los controles de capacidad', () => {
    renderTeams(manual);
    fireEvent.change(screen.getByLabelText('Unidad de Desarrollo'),
      { target: { value: 'day' } });
    expect(handlers.onEditTeam).toHaveBeenCalledWith(dev, { unit: 'day' });
    fireEvent.click(screen.getByLabelText('Incluir QA'));
    expect(handlers.onToggleTeam).toHaveBeenCalledWith(qa, true);
  });
});
