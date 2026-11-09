import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ProjectDetail, QuotationVersion } from '@kora/contracts';
import { QuotationTransferDialog } from './QuotationLifecycleDialogs';

const DEV = '0777e456-fd76-445e-83f1-afc25061c101';
const UX = '0777e456-fd76-445e-83f1-afc25061c102';
const QA = '0777e456-fd76-445e-83f1-afc25061c103';

const project = {
  name: 'Portal comercial',
  soldHours: 60,
  usedHours: 15,
  prospectPhaseHours: 15,
  teams: [
    { teamId: DEV, teamName: 'Desarrollo', assignedHours: 40 },
    { teamId: UX, teamName: 'UX-UI', assignedHours: 20 },
  ],
} as unknown as ProjectDetail;

const version = {
  versionNumber: 2, totalHours: 100, currency: 'UF', netAmount: 200,
  draft: {
    mode: 'phases',
    teams: [
      { teamId: DEV, collaborators: 3, unit: 'week', duration: 2,
        hoursPerWeek: 40, dedicationPercent: 100 },
      { teamId: QA, collaborators: 1, unit: 'week', duration: 1,
        hoursPerWeek: 40, dedicationPercent: 100 },
    ],
    phases: [
      { name: 'Implementación', startWeek: 1, durationWeeks: 2,
        teamHours: [{ teamId: DEV, hours: 80 }, { teamId: QA, hours: 20 }] },
    ],
    paymentPlan: [{ name: 'Inicio', percent: 100, trigger: 'approval' }],
  },
} as unknown as QuotationVersion;

describe('Resumen de traspaso: preservar Prospecto/Cotización como Fase 1', () => {
  it('muestra HH anteriores, cotización, totales y equipos históricos', () => {
    render(<QuotationTransferDialog project={project} version={version}
      open afterApproval={false} pending={false} onClose={vi.fn()}
      onTransfer={vi.fn()}/>);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Fase 1 · Prospecto/Cotización')).toBeInTheDocument();
    expect(within(dialog).getByText(/60 HH previamente asignadas, sin calendario/))
      .toBeInTheDocument();
    expect(within(dialog).getByText(/15 HH consumidas históricas conservadas/))
      .toBeInTheDocument();
    expect(within(dialog).getByText('Fase 2 en adelante · Cotización')).toBeInTheDocument();
    expect(within(dialog).getByText(/160 HH \(anteriores \+ cotización\)/)).toBeInTheDocument();
    expect(within(dialog).getByText(/40 HH previas \+ 80 HH nuevas = 120 HH asignadas/))
      .toBeInTheDocument();
    expect(within(dialog).getByText(/Equipo histórico conservado: 20 HH previas/))
      .toBeInTheDocument();
  });
});
