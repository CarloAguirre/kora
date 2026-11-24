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
  // Contrato previo: las HH vendidas anteriores son venta real y se suman.
  contractAmount: 500,
  modules: [],
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

describe('Resumen de traspaso aditivo con HH previas conservadas', () => {
  it('incluye Fase 0 en HH vendidas pero no en asignaciones nuevas', () => {
    render(<QuotationTransferDialog project={project}
      version={{ ...version, draft: { ...version.draft, phaseZeroBillableHours: 15 } }}
      open afterApproval={false} pending={false} onClose={vi.fn()} onTransfer={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Fase 0 · Levantamiento cobrable')).toBeInTheDocument();
    expect(within(dialog).getByText(/15 HH ya consumidas, incorporadas al precio/)).toBeInTheDocument();
    expect(within(dialog).getByText(/175 HH \(anteriores \+ fases futuras \+ Fase 0\)/))
      .toBeInTheDocument();
    expect(within(dialog).getByText(/40 HH previas \+ 80 HH nuevas = 120 HH asignadas/))
      .toBeInTheDocument();
  });

  it('muestra HH anteriores, cotización, totales y equipos históricos', () => {
    render(<QuotationTransferDialog project={project} version={version}
      open afterApproval={false} pending={false} onClose={vi.fn()}
      onTransfer={vi.fn()}/>);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Presupuesto previo del proyecto')).toBeInTheDocument();
    expect(within(dialog).getByText(/60 HH previamente asignadas que se mantienen/))
      .toBeInTheDocument();
    expect(within(dialog).getByText(/15 HH consumidas históricas conservadas/))
      .toBeInTheDocument();
    expect(within(dialog).getByText('Nuevas fases · Cotización')).toBeInTheDocument();
    expect(within(dialog).getByText(/160 HH \(anteriores \+ cotización\)/)).toBeInTheDocument();
    expect(within(dialog).getByText(/40 HH previas \+ 80 HH nuevas = 120 HH asignadas/))
      .toBeInTheDocument();
    expect(within(dialog).getByText(/Equipo histórico conservado: 20 HH previas/))
      .toBeInTheDocument();
  });

  it('reemplaza las HH estimadas de Cotización cuando no hay Roadmap ni contrato', () => {
    const estimate = { ...project, soldHours: 620, usedHours: 0, contractAmount: null,
      modules: [], teams: [] } as unknown as ProjectDetail;
    render(<QuotationTransferDialog project={estimate} version={version}
      open afterApproval={false} pending={false} onClose={vi.fn()}
      onTransfer={vi.fn()}/>);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('HH estimadas (Prospecto/Cotización)')).toBeInTheDocument();
    expect(within(dialog).getByText(/620 HH; se reemplazan por la cotización aprobada/))
      .toBeInTheDocument();
    expect(within(dialog).queryByText('HH vendidas anteriores')).not.toBeInTheDocument();
    expect(within(dialog).getByText(/^100 HH \(cotización\)/)).toBeInTheDocument();
  });
});
