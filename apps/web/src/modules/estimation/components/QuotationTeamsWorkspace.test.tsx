import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { quotationDraftDataSchema } from '@kora/contracts';
import { QuotationTeamsWorkspace } from './QuotationTeamsWorkspace';
import textStyles from '@/shared/components/ui/TextField.module.css';
import selectStyles from '@/shared/components/ui/Select.module.css';
import segmentedStyles from '@/shared/components/ui/SegmentedControl.module.css';

const dev = '0777e456-fd76-445e-83f1-afc25061c103';
const qa = '0777e456-fd76-445e-83f1-afc25061c104';
const names = new Map([[dev, 'Desarrollo'], [qa, 'QA']]);
const activeTeams = [{ id: dev, name: 'Desarrollo' }, { id: qa, name: 'QA' }];
const handlers = {
  onChangeView: vi.fn(), onEditTeam: vi.fn(), onToggleTeam: vi.fn(),
  onEditGroupHours: vi.fn(), onEditRoleCollaborators: vi.fn(),
  onEditMappedCollaborators: vi.fn(), onEditTeamCapacity: vi.fn(),
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

  it('utiliza campos TextField y Select compartidos sin alterar HH manuales', () => {
    renderTeams(manual);
    const requiredClass = (value: string | undefined, name: string) => {
      if (!value) throw new Error('Falta clase Kora ' + name);
      return value;
    };
    const duration = screen.getByRole('spinbutton', { name: 'Duración de Desarrollo' });
    const unit = screen.getByRole('combobox', { name: 'Unidad de Desarrollo' });
    expect(duration.parentElement).toHaveClass(requiredClass(textStyles.field, 'TextField.field'));
    expect(unit.parentElement).toHaveClass(requiredClass(selectStyles.field, 'Select.field'));
    expect(screen.getByRole('radiogroup', { name: 'Vista de equipos' }))
      .toHaveClass(requiredClass(segmentedStyles.group, 'SegmentedControl.group'));
    expect(screen.getByText('160')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Horas semanales de Desarrollo' }),
      { target: { value: '35' } });
    fireEvent.blur(screen.getByRole('spinbutton', { name: 'Horas semanales de Desarrollo' }));
    expect(handlers.onEditTeamCapacity).toHaveBeenCalledWith(dev, 'hoursPerWeek', 35);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Dedicación de Desarrollo' }),
      { target: { value: '75' } });
    fireEvent.blur(screen.getByRole('spinbutton', { name: 'Dedicación de Desarrollo' }));
    expect(handlers.onEditTeamCapacity).toHaveBeenCalledWith(dev, 'dedicationPercent', 75);
  });


  it('EDT reemplaza 40 y 100 por las HH y dedicación reales, en las mismas columnas', () => {
    renderTeams(mappedEdtDraft);
    expect(screen.getByText('HH/sem reales')).toBeInTheDocument();
    expect(screen.getByText('Dedicación real %')).toBeInTheDocument();
    expect(screen.getByLabelText('HH semanales reales de Desarrollo')).toHaveTextContent('10');
    expect(screen.getByLabelText('Dedicación real de Desarrollo')).toHaveTextContent('25%');
    expect(screen.getByLabelText('Horas totales de Desarrollo')).toHaveValue(40);
    expect(screen.queryByText('Configurar disponibilidad de Desarrollo')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Horas semanales de Desarrollo')).not.toBeInTheDocument();
    expect(handlers.onEditTeamCapacity).not.toHaveBeenCalled();
  });

  it('QA 150 HH durante ocho semanas no equivale a 40 HH/sem ni 100% de dedicación', () => {
    const qaDraft = quotationDraftDataSchema.parse({
      ...mappedEdtDraft, teams: [{
        teamId: qa, collaborators: 1, unit: 'week', duration: 8,
        hoursPerWeek: 40, dedicationPercent: 100,
      }],
      aiPoc: {
        ...mappedEdtDraft.aiPoc!,
        roleTeamIds: { 'Desarrollador Backend': qa },
        edt: {
          ...mappedEdtDraft.aiPoc!.edt!,
          totalHours: 150, totalWithReserve: 150,
          stages: [{ code: 'S1', name: 'Pruebas', startWeek: 1,
            durationWeeks: 8, totalHours: 150 }],
          modules: [{ name: 'Calidad', totalHours: 150, tasks: [{
            wbs: 'S1.01', name: 'Validación', description: 'Pruebas',
            role: 'Desarrollador Backend', hours: 150, stageCode: 'S1',
            roleEffort: [{ role: 'Desarrollador Backend', hours: 150 }],
          }] }],
        },
      },
    });
    renderTeams(qaDraft);
    expect(screen.getByLabelText('Horas totales de QA')).toHaveValue(150);
    expect(screen.getByLabelText('Duración de QA')).toHaveValue(8);
    expect(screen.getByLabelText('HH semanales reales de QA')).toHaveTextContent('18,75');
    expect(screen.getByLabelText('Dedicación real de QA')).toHaveTextContent('46,88%');
    expect(handlers.onEditTeamCapacity).not.toHaveBeenCalled();
  });

  it('muestra la capacidad realmente configurada en una EDT histórica personalizada', () => {
    const customized = quotationDraftDataSchema.parse({
      ...mappedEdtDraft, edtCapacityCustomizedTeamIds: [dev],
      teams: [{ ...team(dev), hoursPerWeek: 20, dedicationPercent: 50 }],
    });
    renderTeams(customized);
    expect(screen.getByLabelText('HH semanales reales de Desarrollo')).toHaveTextContent('10');
    expect(screen.getByLabelText('Dedicación real de Desarrollo')).toHaveTextContent('25%');
    expect(screen.queryByText('Configurar disponibilidad de Desarrollo')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Horas totales de Desarrollo')).toHaveValue(40);
  });

  it('en fases manuales permite editar jornada y dedicación sin un campo de ocupación', () => {
    const phases = quotationDraftDataSchema.parse({
      mode: 'phases', teams: [team(dev)],
      phases: [{ name: 'Entrega', startWeek: 1, durationWeeks: 2,
        teamHours: [{ teamId: dev, hours: 120 }] }],
    });
    renderTeams(phases);
    expect(screen.getByLabelText('Horas semanales de Desarrollo')).toHaveValue(40);
    expect(screen.getByLabelText('Dedicación de Desarrollo')).toHaveValue(100);
    expect(screen.queryByLabelText('Carga semanal media de Desarrollo')).not.toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('el cambio de unidad no altera la cantidad efectiva de semanas', () => {
    renderTeams(mappedEdtDraft);
    fireEvent.change(screen.getByRole('combobox', { name: 'Unidad de Desarrollo' }),
      { target: { value: 'day' } });
    expect(handlers.onEditTeam).toHaveBeenCalledWith(dev, {
      unit: 'day', duration: 10,
    });
  });

  it('permite editar equipos aún no seleccionados en cotizaciones manuales', () => {
    renderTeams(manual);
    expect(screen.getByRole('checkbox', { name: 'Incluir QA' })).not.toBeChecked();
    expect(screen.getByRole('spinbutton', { name: 'Colaboradores de QA' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Unidad de QA' })).toBeEnabled();
    expect(screen.getByRole('spinbutton', { name: 'Duración de QA' })).toBeEnabled();
    expect(screen.getByRole('spinbutton', { name: 'Duración de QA' })).toHaveValue(1);
    expect(screen.getByText(/editar directamente sus campos para incorporarlo/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Duración de QA' }), {
      target: { value: '3' },
    });
    expect(handlers.onEditTeam).toHaveBeenCalledWith(qa, { duration: 3 });
    fireEvent.change(screen.getByRole('combobox', { name: 'Unidad de QA' }), {
      target: { value: 'day' },
    });
    expect(handlers.onEditTeam).toHaveBeenCalledWith(qa, {
      unit: 'day', duration: 5,
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Incluir QA' }));
    expect(handlers.onToggleTeam).toHaveBeenCalledWith(qa, true);
  });

  it('no habilita campos de equipos ausentes en una EDT IA', () => {
    renderTeams(mappedEdtDraft);
    expect(screen.getByRole('checkbox', { name: 'Incluir QA' })).toBeEnabled();
    expect(screen.getByRole('spinbutton', { name: 'Colaboradores de QA' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Unidad de QA' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'Duración de QA' })).toBeDisabled();
    expect(screen.queryByText(/editar directamente sus campos para incorporarlo/))
      .not.toBeInTheDocument();
  });

  it('en Por equipo muestra ocho columnas y solo equipos del catálogo, nunca perfiles como equipos', () => {
    renderTeams(mappedEdtDraft);
    expect(screen.getByText('Unidad')).toBeInTheDocument();
    expect(screen.getByText('Duración')).toBeInTheDocument();
    expect(screen.getByText('HH/sem reales')).toBeInTheDocument();
    expect(screen.getByText('Dedicación real %')).toBeInTheDocument();
    expect(screen.getByLabelText('Incluir Desarrollo')).toBeChecked();
    expect(screen.getByLabelText('Incluir QA')).not.toBeChecked();
    expect(screen.getByLabelText('Horas totales de Desarrollo')).toHaveValue(40);
    expect(screen.getByLabelText('Unidad de Desarrollo')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Duración de Desarrollo'), { target: { value: '5' } });
    expect(handlers.onEditTeam).toHaveBeenCalledWith(dev, { duration: 5 });
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
    expect(handlers.onEditTeam).toHaveBeenCalledWith(dev, { unit: 'day', duration: 10 });
    fireEvent.click(screen.getByLabelText('Incluir QA'));
    expect(handlers.onToggleTeam).toHaveBeenCalledWith(qa, true);
  });
});
