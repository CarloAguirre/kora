import { describe, expect, it, vi } from 'vitest';
import type { UnitOfWork } from '@kora/core';
import { Project } from '../../domain/entities/project.entity';
import type { ProjectRepository } from '../../domain/repositories/project.repository';
import type {
  ProjectPaymentMilestoneRecord,
  ProjectPaymentMilestoneRepository,
} from '../../domain/repositories/project-payment-milestone.repository';
import type { ProjectClientReader } from '../ports/project-client-reader.port';
import type { ProjectUserReader } from '../ports/project-user-reader.port';
import { RecordingNotificationSender, FixedClock } from '../../../../test/fakes';
import { PaymentMilestoneTriggerService, paymentMilestoneReadyReason } from './payment-milestone-trigger.service';
import { isPaymentMilestoneOverdue } from './payment-milestone-overdue';

const NOW = new Date('2026-10-08T15:00:00.000Z');
const TODAY = '2026-10-08';

function milestone(overrides: Partial<ProjectPaymentMilestoneRecord> = {}): ProjectPaymentMilestoneRecord {
  return {
    id: 'milestone-1',
    projectId: 'project-1',
    name: 'Inicio',
    percent: 50,
    amount: 120,
    invoiceNumber: null,
    issuedAt: null,
    dueAt: null,
    status: 'pending',
    paidAt: null,
    sortOrder: 0,
    triggerType: 'approval',
    triggerPhase: null,
    triggerDate: null,
    ...overrides,
  };
}

function project(overrides: { salesStage?: 'quoted' | 'approved'; phase?: 'development' | 'pilot' | null } = {}) {
  return Project.create({
    id: 'project-1',
    name: 'Portal de Proveedores',
    slug: 'portal-de-proveedores',
    clientId: 'client-1',
    type: 'development',
    salesStage: overrides.salesStage ?? 'approved',
    phase: overrides.phase ?? null,
    contractCurrency: 'CLP',
    now: NOW,
  }).unwrap();
}

describe('paymentMilestoneReadyReason', () => {
  it('Inicio: queda por facturar cuando el proyecto está aprobado', () => {
    expect(paymentMilestoneReadyReason(milestone(), project(), TODAY)).toBe('el proyecto fue aprobado');
    expect(paymentMilestoneReadyReason(milestone(), project({ salesStage: 'quoted' }), TODAY)).toBeNull();
  });

  it('por fase: se cumple al llegar a esa fase o a una posterior', () => {
    const marchaBlanca = milestone({ name: 'Marcha blanca', triggerType: 'phase', triggerPhase: 'testing' });
    expect(paymentMilestoneReadyReason(marchaBlanca, project({ phase: 'development' }), TODAY)).toBeNull();
    expect(paymentMilestoneReadyReason(marchaBlanca, project({ phase: 'pilot' }), TODAY)).toBe('el proyecto llegó a la fase Pruebas');
  });

  it('por fecha: se cumple desde ese día (hora de Chile)', () => {
    const cuota = milestone({ triggerType: 'date', triggerDate: new Date('2026-10-08') });
    expect(paymentMilestoneReadyReason(cuota, project(), '2026-10-07')).toBeNull();
    expect(paymentMilestoneReadyReason(cuota, project(), TODAY)).toBe('llegó su fecha de cobro (08-10-2026)');
  });

  it('nunca para tramos manuales, en 0 o que ya no están pendientes', () => {
    expect(paymentMilestoneReadyReason(milestone({ triggerType: 'manual' }), project(), TODAY)).toBeNull();
    expect(paymentMilestoneReadyReason(milestone({ amount: 0 }), project(), TODAY)).toBeNull();
    expect(paymentMilestoneReadyReason(milestone({ status: 'to_invoice' }), project(), TODAY)).toBeNull();
  });
});

describe('isPaymentMilestoneOverdue', () => {
  it('atrasado = facturado sin pago con el vencimiento ya pasado', () => {
    const dueAt = new Date('2026-10-07');
    expect(isPaymentMilestoneOverdue({ status: 'invoiced', dueAt }, TODAY)).toBe(true);
    expect(isPaymentMilestoneOverdue({ status: 'invoiced', dueAt: new Date(TODAY) }, TODAY)).toBe(false);
    expect(isPaymentMilestoneOverdue({ status: 'paid', dueAt }, TODAY)).toBe(false);
    expect(isPaymentMilestoneOverdue({ status: 'invoiced', dueAt: null }, TODAY)).toBe(false);
  });
});

describe('PaymentMilestoneTriggerService', () => {
  function build(milestones: ProjectPaymentMilestoneRecord[], alreadyPromoted: string[] = []) {
    const repository = {
      listForProject: vi.fn().mockResolvedValue(milestones),
      markToInvoice: vi.fn((id: string) => Promise.resolve(!alreadyPromoted.includes(id))),
    } as unknown as ProjectPaymentMilestoneRepository;
    const clients = { findById: vi.fn().mockResolvedValue({ id: 'client-1', companyName: 'Cliente Demo' }) } as unknown as ProjectClientReader;
    const users = {
      findActiveBillingRecipients: vi.fn().mockResolvedValue([
        { id: 'u-1', fullName: 'Ana Finanzas', email: 'ana@kabeli.cl' },
        { id: 'u-2', fullName: 'Gerencia General', email: 'gerencia@kabeli.cl' },
      ]),
    } as unknown as ProjectUserReader;
    const notifications = new RecordingNotificationSender();
    const unitOfWork = { run: vi.fn((work: (tx: unknown) => Promise<unknown>) => work({})) } as unknown as UnitOfWork;
    const service = new PaymentMilestoneTriggerService(
      repository,
      {} as ProjectRepository,
      clients,
      users,
      notifications,
      unitOfWork,
      new FixedClock(NOW),
    );
    return { service, repository, notifications };
  }

  it('pasa a Por facturar los tramos cuyo hito se cumplió y avisa a Finanzas y Gerencia', async () => {
    const inicio = milestone();
    const marchaBlanca = milestone({ id: 'milestone-2', name: 'Marcha blanca', triggerType: 'phase', triggerPhase: 'pilot' });
    const { service, repository, notifications } = build([inicio, marchaBlanca]);

    await service.promoteAndNotify(project({ phase: 'development' }));

    expect(repository.markToInvoice).toHaveBeenCalledTimes(1);
    expect(repository.markToInvoice).toHaveBeenCalledWith('milestone-1', {});
    expect(notifications.projectPaymentMilestoneReady.map((n) => n.recipientEmail)).toEqual(['ana@kabeli.cl', 'gerencia@kabeli.cl']);
    expect(notifications.projectPaymentMilestoneReady[0]).toMatchObject({
      recipientFirstName: 'Ana',
      projectName: 'Portal de Proveedores',
      clientName: 'Cliente Demo',
      milestoneName: 'Inicio',
      amount: 120,
      currency: 'CLP',
      reason: 'el proyecto fue aprobado',
    });
  });

  it('no vuelve a avisar si otra lectura ya promovió el tramo', async () => {
    const { service, notifications } = build([milestone()], ['milestone-1']);

    await service.promoteAndNotify(project());

    expect(notifications.projectPaymentMilestoneReady).toHaveLength(0);
  });

  it('un correo que falla no rompe la operación', async () => {
    const { service, notifications } = build([milestone()]);
    notifications.shouldFail = true;

    await expect(service.promoteAndNotify(project())).resolves.toBeUndefined();
  });
});
