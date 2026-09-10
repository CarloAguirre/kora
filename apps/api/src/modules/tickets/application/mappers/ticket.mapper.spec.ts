import { describe, expect, it } from 'vitest';
import type { TicketListItem } from '../../domain/repositories/ticket.repository';
import { toTicketSummary } from './ticket.mapper';

function buildItem(overrides: Partial<TicketListItem>): TicketListItem {
  return {
    id: 'ticket-1',
    legacyId: 'TK-0879',
    title: 'Movimiento tc revisión',
    description: null,
    resolution: null,
    clientId: null,
    clientName: null,
    projectId: null,
    projectName: null,
    supportLeaderInitials: null,
    developmentProjectId: null,
    developmentProjectName: null,
    serviceType: 'incident',
    priority: 'high',
    status: 'in_progress',
    assigneeUserId: null,
    assigneeName: null,
    estimatedHours: null,
    usedHours: 0,
    pendingHhRequestsCount: 0,
    pendingHhHours: 0,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('toTicketSummary — código visible', () => {
  it('antepone "IN" para incidentes, tomando solo los dígitos del legacyId', () => {
    const summary = toTicketSummary(buildItem({ legacyId: 'TK-0879', serviceType: 'incident' }));
    expect(summary.code).toBe('IN0879');
  });

  it('antepone "ME" para mejoras', () => {
    const summary = toTicketSummary(buildItem({ legacyId: 'TK-0886', serviceType: 'improvement' }));
    expect(summary.code).toBe('ME0886');
  });

  it('rellena con ceros a la izquierda hasta 4 dígitos', () => {
    const summary = toTicketSummary(buildItem({ legacyId: 'TK-9', serviceType: 'incident' }));
    expect(summary.code).toBe('IN0009');
  });

  it('sin legacyId (ticket creado en v2) no hay código', () => {
    const summary = toTicketSummary(buildItem({ legacyId: null }));
    expect(summary.code).toBeNull();
  });
});
