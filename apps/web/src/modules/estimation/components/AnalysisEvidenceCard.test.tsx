import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { estimationAnalysisArtifactSchema } from '@kora/contracts';
import { AnalysisEvidenceCard } from './AnalysisEvidenceCard';

const evidence = estimationAnalysisArtifactSchema.parse({
  schemaVersion: 'kora.estimation.analysis.v1',
  provenance: {
    mode: 'simulated_fixture', provider: null, model: null,
    label: 'Fixture', warning: 'IA simulada',
    sourceFiles: [{ id: 'edt', name: 'estimacion.xlsx', kind: 'edt', sha256: 'a'.repeat(64) }],
  },
  project: { name: 'Zurich demo', client: 'Cliente demo', objective: 'Portal' },
  scope: { included: ['Portal'], excluded: ['SAP'], validationStatus: 'fixture' },
  sourceRequirements: [{
    id: 'R01', text: 'Cargar documento Excel', origin: 'ERS', acceptance: 'Archivo validado',
  }],
  userStories: [{
    id: 'HU01', actor: 'Solicitante', need: 'Cargar datos',
    acceptance: 'Archivo validado', requirementIds: ['R01'],
  }],
  pendingDecisions: [{ id: 'P01', decision: 'Validar plantilla', impact: 'Parser', owner: 'Zurich' }],
  roles: [{ role: 'Fullstack', headcount: 1, baseHours: 8 }],
  modules: [{ name: 'Portal', activityCount: 1, hoursByRole: { Fullstack: 8 }, totalHours: 8 }],
  tranches: [{
    id: 'T01', name: 'Implementación', startWeek: 1, durationWeeks: 1,
    hoursByRole: { Fullstack: 8 }, totalHours: 8,
  }],
  activities: [{
    wbs: 'T01.01', trancheId: 'T01', module: 'Portal',
    description: 'Implementar carga Excel', requirementIds: ['R01'],
    sourceClassification: 'C', responsibleRole: 'Fullstack',
    hoursByRole: { Fullstack: 8 }, totalHours: 8,
    trace: { artifact: 'edt', sheet: 'EDT_Detalle', row: 5 },
  }],
  dailyPlan: [{ workingDay: 1, trancheId: 'T01', role: 'Fullstack',
    activityId: 'T01.01', description: 'Implementar carga Excel', hours: 8 }],
  weeklyPlan: [{ week: 'S01', hoursByRole: { Fullstack: 8 } }],
  milestones: [],
  assumptions: [],
  summary: { baseHours: 8, reservePercent: 10, reserveHours: 0.8,
    hoursWithReserve: 8.8, durationWorkingDays: 1, hoursByRole: { Fullstack: 8 } },
  commercial: { hourlyRate: null, currency: null, tax: null, paymentPlan: [] },
  roleTeamMappings: { status: 'unmapped', suggestions: {} },
  renderBlueprints: { ers: [], edt: [] },
});

describe('AnalysisEvidenceCard', () => {
  it('muestra WBS, horas base y reserva separada sin usar API', () => {
    render(<AnalysisEvidenceCard analysis={evidence} projectionStatus="synced" versionLabel="v1" />);
    expect(screen.getByText('T01.01')).toBeInTheDocument();
    expect(screen.getByText('Implementar carga Excel')).toBeInTheDocument();
    expect(screen.getByText('Simulación con documentos de ejemplo, no generada por Gemini.', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar JSON fuente' })).toBeInTheDocument();
  });

  it('permite navegar al ERS y al cronograma sin modificar datos', () => {
    render(<AnalysisEvidenceCard analysis={evidence} versionLabel="v1" />);
    fireEvent.click(screen.getByRole('tab', { name: /ERS · requisitos/ }));
    expect(screen.getByText('Cargar documento Excel')).toBeInTheDocument();
    expect(screen.getByText('Validar plantilla')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Cronograma/ }));
    expect(screen.getByRole('heading', { name: 'Plan semanal — HH por perfil' })).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Ver plan diario/));
    expect(screen.getByText('T01.01 · Implementar carga Excel')).toBeInTheDocument();
  });

  it('advierte que el presupuesto editado puede diferir del EDT', () => {
    render(<AnalysisEvidenceCard analysis={evidence} versionLabel="v2" projectionStatus="modified" />);
    expect(screen.getByRole('status')).toHaveTextContent(/fue editado después de importar/);
  });

  it('permite filtrar una actividad sin perder el total base del documento', () => {
    render(<AnalysisEvidenceCard analysis={evidence} versionLabel="v1" />);
    fireEvent.change(screen.getByRole('searchbox', { name: /Buscar actividad/ }), {
      target: { value: 'no existe' },
    });
    expect(screen.getByText(/No hay actividades que coincidan/)).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument(); // KPI de HH base inmutable
  });
});
