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
    renderTeams(edtDraft);
    expect(screen.getByLabelText('Horas totales de Desarrollo')).toHaveValue(40);
    expect(screen.queryByText('Unidad')).not.toBeInTheDocument();
    expect(screen.queryByText('Duración')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Horas totales de Desarrollo'),
      { target: { value: '38' } });
    expect(handlers.onEditGroupHours).toHaveBeenCalledWith('profile:Desarrollo', 38);
    fireEvent.change(screen.getByLabelText('Colaboradores de Desarrollo'),
      { target: { value: '3' } });
    expect(handlers.onEditRoleCollaborators).toHaveBeenCalledWith('Desarrollo', 3);
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
