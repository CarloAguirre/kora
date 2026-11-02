import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { quotationVersionSchema } from '@kora/contracts';
import { AiPocRoleMappingCard } from './AiPocRoleMappingCard';

const teamId = '0777e456-fd76-445e-83f1-afc25061c105';
const version = quotationVersionSchema.parse({
  id: '0777e456-fd76-445e-83f1-afc25061c103',
  quotationId: '0777e456-fd76-445e-83f1-afc25061c102',
  versionNumber: 2, revision: 1, status: 'draft', origin: 'ai',
  name: 'IA KDM (demo)', aiReviewStatus: 'pending',
  createdByUserId: '0777e456-fd76-445e-83f1-afc25061c104',
  hourlyRate: null, currency: 'UF', tax: 'iva19',
  totalHours: 0, netAmount: null, totalAmount: null,
  createdAt: '2026-11-02T10:00:00.000Z', updatedAt: '2026-11-02T10:00:00.000Z',
  draft: {
    mode: 'phases',
    sourceRefs: ['demo:kdm_fixture'], answers: { F01: 'mvp' },
    aiPoc: {
      source: 'kdm_demo',
      answers: [{ questionId: 'F01', value: 'mvp', usedAssumption: false }],
      dynamicQuestions: [],
      proposal: {
        projectId: '0777e456-fd76-445e-83f1-afc25061c101',
        provider: 'gemini', sourceMode: 'poc_simulated',
        documentsAnalyzed: 1,
        summary: 'KDM requiere portal e integración SAP.',
        roles: [
          { role: 'Desarrollo', unit: 'week', duration: 1,
            hoursPerUnit: 40, people: 1, totalHours: 40 },
          { role: 'QA', unit: 'week', duration: 1,
            hoursPerUnit: 20, people: 1, totalHours: 20 },
        ],
        totalHours: 60, assumptions: [], clarifyingQuestions: [],
      },
      roleTeamIds: {},
    },
  },
});
const teams = [{ id: teamId, name: 'Desarrollo Kora' }];

describe('AiPocRoleMappingCard · sistema de diseño Kora', () => {
  it('exige mapear ambos perfiles y suma sus HH cuando comparten equipo', () => {
    const onApply = vi.fn();
    render(<AiPocRoleMappingCard
      version={version} teams={teams} canEdit hasUnsavedChanges={false}
      onApply={onApply} />);
    expect(screen.getByText('60 HH propuestas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar distribución de HH' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Equipo para Desarrollo'), {
      target: { value: teamId },
    });
    fireEvent.change(screen.getByLabelText('Equipo para QA'), {
      target: { value: teamId },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar distribución de HH' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const draft = onApply.mock.calls[0]?.[0];
    expect(draft).toMatchObject({
      mode: 'phases', analysisProjectionStatus: 'synced',
      teams: [{ teamId }],
      phases: [
        { teamHours: [{ teamId, hours: 40 }] },
        { teamHours: [{ teamId, hours: 20 }] },
      ],
    });
    expect(draft.aiPoc.proposal.totalHours).toBe(60);
  });

  it('no permite cambios con formulario sucio ni en versión de consulta', () => {
    const onApply = vi.fn();
    const view = render(<AiPocRoleMappingCard
      version={version} teams={teams} canEdit hasUnsavedChanges
      onApply={onApply} />);
    expect(screen.getByRole('button', { name: 'Aplicar distribución de HH' })).toBeDisabled();
    view.rerender(<AiPocRoleMappingCard
      version={version} teams={teams} canEdit={false} hasUnsavedChanges={false}
      onApply={onApply} />);
    expect(screen.queryByRole('button', { name: 'Aplicar distribución de HH' }))
      .not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });
});
