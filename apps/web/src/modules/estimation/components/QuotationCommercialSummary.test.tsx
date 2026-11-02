import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { quotationVersionSchema, type QuotationDraftData } from '@kora/contracts';
import { QuotationCommercialSummary } from './QuotationCommercialSummary';

const teamId = '0777e456-fd76-445e-83f1-afc25061c105';
const version = quotationVersionSchema.parse({
  id: '0777e456-fd76-445e-83f1-afc25061c103',
  quotationId: '0777e456-fd76-445e-83f1-afc25061c102',
  versionNumber: 1, revision: 1, status: 'draft', origin: 'ai',
  name: 'Cotización KDM', aiReviewStatus: 'pending',
  createdByUserId: '0777e456-fd76-445e-83f1-afc25061c104',
  hourlyRate: null, currency: 'UF', tax: 'iva19',
  totalHours: 0, netAmount: null, totalAmount: null,
  createdAt: '2026-11-02T10:00:00.000Z', updatedAt: '2026-11-02T10:00:00.000Z',
  draft: {
    mode: 'team', answers: {}, sourceRefs: [],
    aiPoc: {
      source: 'kdm_demo', answers: [], dynamicQuestions: [],
      roleTeamIds: {},
      proposal: {
        projectId: '0777e456-fd76-445e-83f1-afc25061c101',
        provider: 'gemini', sourceMode: 'poc_simulated',
        documentsAnalyzed: 1, summary: 'Estimación KDM.',
        roles: [{ role: 'Desarrollo', unit: 'week', duration: 1,
          hoursPerUnit: 40, people: 1, totalHours: 40 }],
        totalHours: 40, assumptions: [], clarifyingQuestions: [],
      },
    },
  },
});

const baseProps = {
  version,
  teamNames: new Map([[teamId, 'Desarrollo']]),
  hourlyRate: null,
  currency: 'UF' as const,
  tax: 'iva19' as const,
  editable: true,
  dirty: false,
  saving: false,
  onSave: vi.fn(),
};

describe('QuotationCommercialSummary · fidelidad comercial sin alterar el cálculo', () => {
  it('distingue HH de Gemini de las HH aún no distribuidas', () => {
    render(<QuotationCommercialSummary {...baseProps} draft={version.draft} />);
    expect(screen.getByText('40 HH propuestas por IA')).toBeInTheDocument();
    expect(screen.getByText('Sin HH distribuidas entre equipos.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios del borrador' })).toBeDisabled();
  });

  it('muestra el cálculo comercial de vista previa y permite guardarlo', () => {
    const draft: QuotationDraftData = {
      ...version.draft,
      teams: [{ teamId, collaborators: 2, unit: 'week', duration: 2,
        hoursPerWeek: 40, dedicationPercent: 100 }],
    };
    const onSave = vi.fn();
    render(<QuotationCommercialSummary {...baseProps} draft={draft}
      dirty hourlyRate={0.62} onSave={onSave} />);
    expect(screen.getByText('160 HH')).toBeInTheDocument();
    expect(screen.getByText('99,2 UF')).toBeInTheDocument();
    expect(screen.getByText('118,048 UF')).toBeInTheDocument();
    expect(screen.getByText('Sin guardar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios del borrador' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('en modo fases solo contabiliza HH de equipos incluidos sin duplicarlas', () => {
    const draft: QuotationDraftData = {
      ...version.draft, mode: 'phases',
      teams: [{ teamId, collaborators: 1, unit: 'week', duration: 2,
        hoursPerWeek: 40, dedicationPercent: 100 }],
      phases: [
        { name: 'Análisis', startWeek: 1, durationWeeks: 1, teamHours: [{ teamId, hours: 20 }] },
        { name: 'Implementación', startWeek: 2, durationWeeks: 3, teamHours: [{ teamId, hours: 30 }] },
      ],
    };
    render(<QuotationCommercialSummary {...baseProps} draft={draft} />);
    expect(screen.getByText('4 semanas · 2 fases')).toBeInTheDocument();
    expect(screen.getByText('50 HH')).toBeInTheDocument();
  });
});
