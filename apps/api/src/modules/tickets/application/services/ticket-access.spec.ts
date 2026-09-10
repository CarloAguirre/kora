import { describe, expect, it } from 'vitest';
import type { Permission } from '@kora/contracts';
import type { TicketProjectReader, TicketProjectReference } from '../ports/ticket-project-reader.port';
import { canManageTicket } from './ticket-access';

/**
 * `isProjectApprover` ahora es EXCLUYENTE por responsable del ticket, mismo
 * criterio que `HourEntryApprovalAuthorityService` (ver
 * docs/DECISION-M4-HORAS.md): si el responsable tiene líder de equipo
 * resoluble para el proyecto, SOLO ese líder gestiona — no "cualquier líder
 * de cualquier equipo asignado al proyecto" (el defecto que sí tenían Horas
 * y que Tickets heredó hasta ahora vía `isProjectLeaderOrTeamLeader`, sin
 * acotar por responsable). Este fake simula ya resuelta esa exclusividad,
 * documentando el contrato que `canManageTicket` espera de su puerto.
 */
class FakeProjectReader implements TicketProjectReader {
  constructor(private readonly approverId: string | null) {}
  async findById(): Promise<TicketProjectReference | null> {
    return null;
  }
  async isProjectApprover(_projectId: string, actorUserId: string): Promise<boolean> {
    return this.approverId === actorUserId;
  }
  async findHhApprovers(): Promise<{ id: string; fullName: string }[]> {
    return [];
  }
}

const NO_PERMISSIONS: Permission[] = [];

describe('canManageTicket', () => {
  it('con tickets:manage, gestiona cualquier ticket', async () => {
    const canManage = await canManageTicket(
      { projectId: null, assigneeUserId: 'other-user' },
      'actor-1',
      ['tickets:manage'],
      new FakeProjectReader(null),
    );
    expect(canManage).toBe(true);
  });

  it('el responsable del ticket puede gestionarlo aunque no tenga ningún permiso ni autoridad de proyecto', async () => {
    const canManage = await canManageTicket(
      { projectId: 'project-1', assigneeUserId: 'actor-1' },
      'actor-1',
      NO_PERMISSIONS,
      new FakeProjectReader('someone-else'),
    );
    expect(canManage).toBe(true);
  });

  it('con proyecto y líder de equipo resoluble para el responsable, SOLO ese líder gestiona', async () => {
    const ticket = { projectId: 'project-1', assigneeUserId: 'collaborator-1' };
    const projects = new FakeProjectReader('team-leader-1');

    expect(await canManageTicket(ticket, 'team-leader-1', NO_PERMISSIONS, projects)).toBe(true);
    // El líder del proyecto queda excluido si no coincide con el líder de
    // equipo resuelto — mismo criterio que horas.
    expect(await canManageTicket(ticket, 'project-leader-1', NO_PERMISSIONS, projects)).toBe(false);
  });

  it('sin líder de equipo resoluble para el responsable, decide el líder de proyecto', async () => {
    const ticket = { projectId: 'project-1', assigneeUserId: 'collaborator-1' };
    const projects = new FakeProjectReader('project-leader-1');

    expect(await canManageTicket(ticket, 'project-leader-1', NO_PERMISSIONS, projects)).toBe(true);
  });

  it('un ticket sin responsable asignado igual puede quedar en manos del líder de proyecto', async () => {
    const ticket = { projectId: 'project-1', assigneeUserId: null };
    const projects = new FakeProjectReader('project-leader-1');

    expect(await canManageTicket(ticket, 'project-leader-1', NO_PERMISSIONS, projects)).toBe(true);
  });

  it('sin proyecto, sin ser responsable y sin tickets:manage, no puede gestionarlo', async () => {
    const canManage = await canManageTicket(
      { projectId: null, assigneeUserId: 'other-user' },
      'actor-1',
      NO_PERMISSIONS,
      new FakeProjectReader('actor-1'),
    );
    expect(canManage).toBe(false);
  });
});
