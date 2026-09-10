import { describe, expect, it } from 'vitest';
import type { HourEntryListItem } from '../../domain/repositories/hour-entry.repository';
import { toHourEntrySummary } from './hour-entry.mapper';

function buildItem(overrides: Partial<HourEntryListItem> = {}): HourEntryListItem {
  return {
    id: 'entry-1',
    userId: 'owner-1',
    userFullName: 'Owner',
    projectId: null,
    projectName: null,
    teamId: null,
    teamName: null,
    assignment: 'Vacaciones',
    category: '',
    description: '',
    hours: 8,
    date: new Date('2026-01-01'),
    isOvertime: false,
    projectStageAtEntry: null,
    status: 'pending',
    rejectionReason: null,
    designatedApproverUserId: null,
    designatedApproverFullName: null,
    projectApprovers: [],
    createdAt: new Date('2026-01-01'),
    decisionUserId: null,
    decisionByFullName: null,
    clientId: null,
    clientName: null,
    projectType: null,
    projectSalesStage: null,
    ...overrides,
  };
}

/**
 * Un registro CON proyecto nunca se aprueba por aprobador designado (ver
 * `HourEntry.create`/`update`, `DesignatedApproverNotAllowedError`) — pero
 * datos migrados de la v1 dejaron `designated_approver_user_id` poblado en
 * filas con proyecto igual. Confirmado contra la base real: 9 de 52 horas
 * pendientes con proyecto mostraban ese valor heredado, DISTINTO del líder
 * que realmente puede aprobarlas (p.ej. un ex-líder de proyecto que ya no
 * tiene autoridad ahí). El mapper debe ignorarlo para que la UI nunca
 * muestre "debe aprobar" a alguien sin autoridad real sobre ese registro.
 */
describe('toHourEntrySummary — designatedApprover', () => {
  it('ignora el aprobador designado heredado cuando el registro tiene proyecto', () => {
    const summary = toHourEntrySummary(
      buildItem({
        projectId: 'project-1',
        projectName: 'Proyecto',
        designatedApproverUserId: 'stale-leader',
        designatedApproverFullName: 'Ex Líder',
        projectApprovers: [{ id: 'real-leader', fullName: 'Líder Real' }],
      }),
    );

    expect(summary.designatedApprover).toBeNull();
    expect(summary.projectApprovers).toEqual([{ id: 'real-leader', fullName: 'Líder Real' }]);
  });

  it('respeta el aprobador designado cuando el registro NO tiene proyecto', () => {
    const summary = toHourEntrySummary(
      buildItem({
        projectId: null,
        designatedApproverUserId: 'designated-1',
        designatedApproverFullName: 'Líder Designado',
      }),
    );

    expect(summary.designatedApprover).toEqual({ id: 'designated-1', fullName: 'Líder Designado' });
  });
});
