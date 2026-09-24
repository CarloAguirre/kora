import { describe, expect, it } from 'vitest';
import { HourEntry } from '../../domain/entities/hour-entry.entity';
import type { HourEntryProjectApprover, HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import type { HourEntryTeamReader } from '../ports/hour-entry-team-reader.port';
import { HourEntryApprovalAuthorityService } from './hour-entry-approval-authority.service';

const NOW = new Date('2026-08-25T12:00:00.000Z');

function buildProjectEntry(overrides: { userId?: string } = {}): HourEntry {
  return HourEntry.create({
    id: 'entry-1',
    userId: overrides.userId ?? 'owner-1',
    assignment: 'Proyecto',
    projectId: 'project-1',
    hours: 4,
    date: new Date('2026-08-24'),
    ownerRequiresApproval: false,
    now: NOW,
  }).unwrap();
}

function buildNoProjectEntry(designatedApproverUserId: string | null): HourEntry {
  return HourEntry.create({
    id: 'entry-2',
    userId: 'owner-1',
    assignment: 'Vacaciones',
    hours: 8,
    date: new Date('2026-08-24'),
    designatedApproverUserId,
    ownerRequiresApproval: designatedApproverUserId !== null,
    now: NOW,
  }).unwrap();
}

/**
 * Reproduce la regla EXCLUYENTE que ahora vive en
 * `DrizzleProjectRepository.isProjectLeaderOrTeamLeaderOfMember` (ver
 * docs/DECISION-M4-HORAS.md): si el dueño del registro tiene líder de equipo
 * resoluble, SOLO ese líder puede decidir — el líder de proyecto queda
 * excluido. Esta clase de prueba (`HourEntryApprovalAuthorityService`) no
 * ejecuta esa consulta SQL; documenta el contrato que `canDecide` espera de
 * su puerto de lectura, simulando aquí el resultado ya excluyente.
 */
class FakeProjectReader implements HourEntryProjectReader {
  constructor(private readonly approverId: string | null) {}
  async findById(): Promise<null> {
    return null;
  }
  async findManyByIds(): Promise<never[]> {
    return [];
  }
  async findModuleById(): Promise<null> {
    return null;
  }
  async recalculateUsedHours(): Promise<void> {}
  async isProjectApprover(_projectId: string, actorUserId: string): Promise<boolean> {
    return this.approverId === actorUserId;
  }
  async findApprovers(): Promise<HourEntryProjectApprover[]> {
    return this.approverId ? [{ id: this.approverId, fullName: 'Aprobador' }] : [];
  }
}

class FakeTeamReader implements HourEntryTeamReader {
  constructor(private readonly leaderOf: Record<string, string> = {}) {}
  async isTeamLeaderOfMember(leaderUserId: string, memberUserId: string): Promise<boolean> {
    return this.leaderOf[memberUserId] === leaderUserId;
  }
  async findTeamMemberUserIds(): Promise<string[]> {
    return [];
  }
  async findTeamForUser(): Promise<null> {
    return null;
  }
}

describe('HourEntryApprovalAuthorityService', () => {
  it('admin siempre puede decidir, tenga o no acceso al proyecto', async () => {
    const service = new HourEntryApprovalAuthorityService(new FakeProjectReader(null), new FakeTeamReader());
    const canDecide = await service.canDecide('someone-else', 'admin', buildProjectEntry());
    expect(canDecide).toBe(true);
  });

  it('pmo siempre puede decidir', async () => {
    const service = new HourEntryApprovalAuthorityService(new FakeProjectReader(null), new FakeTeamReader());
    const canDecide = await service.canDecide('someone-else', 'pmo', buildProjectEntry());
    expect(canDecide).toBe(true);
  });

  it('con proyecto y líder de equipo resoluble, SOLO el líder de equipo puede decidir', async () => {
    const service = new HourEntryApprovalAuthorityService(new FakeProjectReader('team-leader-1'), new FakeTeamReader());
    const entry = buildProjectEntry();

    expect(await service.canDecide('team-leader-1', 'leader', entry)).toBe(true);
    // El líder de proyecto queda excluido: el fake solo resuelve al líder de
    // equipo como aprobador — reproduce lo que hace la consulta real cuando
    // hay un líder de equipo resoluble para el dueño del registro.
    expect(await service.canDecide('project-leader-1', 'leader', entry)).toBe(false);
  });

  it('con proyecto y SIN líder de equipo resoluble, decide el líder de proyecto', async () => {
    const service = new HourEntryApprovalAuthorityService(new FakeProjectReader('project-leader-1'), new FakeTeamReader());
    const entry = buildProjectEntry();

    expect(await service.canDecide('project-leader-1', 'leader', entry)).toBe(true);
    expect(await service.canDecide('team-leader-1', 'leader', entry)).toBe(false);
  });

  it('con proyecto, quien no es ni líder de proyecto ni de equipo no puede decidir', async () => {
    const service = new HourEntryApprovalAuthorityService(new FakeProjectReader('team-leader-1'), new FakeTeamReader());
    const canDecide = await service.canDecide('collaborator-2', 'collaborator', buildProjectEntry());
    expect(canDecide).toBe(false);
  });

  it('sin proyecto y con aprobador designado, solo ese aprobador puede decidir', async () => {
    const service = new HourEntryApprovalAuthorityService(new FakeProjectReader(null), new FakeTeamReader());
    const entry = buildNoProjectEntry('designated-1');

    expect(await service.canDecide('designated-1', 'leader', entry)).toBe(true);
    expect(await service.canDecide('other-leader', 'leader', entry)).toBe(false);
  });

  it('sin proyecto y sin aprobador designado, decide quien lidera al dueño del registro', async () => {
    const service = new HourEntryApprovalAuthorityService(
      new FakeProjectReader(null),
      new FakeTeamReader({ 'owner-1': 'team-leader-9' }),
    );
    const entry = buildNoProjectEntry(null);

    expect(await service.canDecide('team-leader-9', 'leader', entry)).toBe(true);
    expect(await service.canDecide('someone-else', 'leader', entry)).toBe(false);
  });
});
