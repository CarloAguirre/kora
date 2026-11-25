import { describe, expect, it } from 'vitest';
import type { ProjectDetail } from '@kora/contracts';
import type { Database } from '@kora/db';
import type { GetProjectUseCase } from '../projects/application/use-cases/get-project.use-case';
import type { GetSupportPlanUseCase } from '../tickets/application/use-cases/get-support-plan.use-case';
import type { CreateUserUseCase } from '../users/application/use-cases/create-user.use-case';
import type { GrantUserAccessUseCase } from '../users/application/use-cases/grant-user-access.use-case';
import type { UserCredentialRepository } from '../users/domain/repositories/user-credential.repository';
import { ClientPortalService } from './client-portal.service';

describe('ClientPortalService — DTO exclusivamente externo', () => {
  it('publica la geometría del Gantt y las entregas, sin HH, miembros ni tareas operativas', () => {
    const service = new ClientPortalService(
      {} as Database,
      {} as GetProjectUseCase,
      {} as GetSupportPlanUseCase,
      {} as CreateUserUseCase,
      {} as GrantUserAccessUseCase,
      {} as UserCredentialRepository,
    );
    // Se verifica la whitelist sin necesitar una conexión a una BD real.
    const detail = {
      id: 'project-1', name: 'Proyecto', slug: 'proyecto', status: 'active',
      updatedAt: '2026-11-11T12:00:00.000Z', salesStage: 'approved',
      phase: 'development', startDate: '2026-10-01', endDate: '2026-12-01',
      client: null, primaryContact: null, commercialManager: null, leader: null,
      soldHours: 100, usedHours: 20, usedHoursUpdatedAt: null, leaderLastActivityAt: null,
      progress: { actual: 20, expected: 30 }, contractCurrency: 'UF', contractAmount: 180,
      paymentMilestones: [],
      modules: [{
        id: 'fase-1', name: 'Planificación', currentStage: 'in_progress', blockerCount: 1,
        segments: [{
          id: 'segmento-1', teamName: 'DEV', name: 'Desarrollo',
          startDate: '2026-10-01', endDate: '2026-11-01',
          closedAt: null, estimatedHours: 90, members: [{ fullName: 'Persona interna' }],
        }],
        tasks: [{ id: 'tarea-privada', name: 'TAREA INTERNA SECRET', date: '2026-10-04' }],
        deliveries: [
          { id: 'entrega-1', name: 'Informe comprometido', teamName: 'DEV',
            estimatedDate: '2026-11-18', createdAt: '2026-10-12T12:00:00.000Z', status: 'approved' },
        ],
      }],
      observations: [],
      impactBeforeHours: 24, impactBeforePeople: '3 personas',
      impactBeforeDuration: '3 días laborales', impactBeforeModality: 'Planillas Excel',
      impactAfterHours: 2, impactAfterPeople: '1 persona',
      impactAfterDuration: 'Mismo día', impactAfterModality: 'Tablero automático',
    } as unknown as ProjectDetail;
    const external = (
      service as unknown as {
        publicProject(input: ProjectDetail): {
          modules: Array<{ id: string; name: string; deliveries: Array<{ status: string }> }>;
        };
      }
    ).publicProject(detail);
    expect(external.modules).toEqual([{
      id: 'fase-1', name: 'Planificación', currentStage: 'in_progress',
      timelineSegments: [{
        id: 'segmento-1', teamName: 'DEV', name: 'Desarrollo',
        startDate: '2026-10-01', endDate: '2026-11-01', closedAt: null,
      }],
      deliveries: [{ id: 'entrega-1', name: 'Informe comprometido',
        teamName: 'DEV', estimatedDate: '2026-11-18',
        createdAt: '2026-10-12T12:00:00.000Z', status: 'approved' }],
    }]);
    const externalJson = JSON.stringify(external);
    expect(externalJson).not.toContain('tarea-privada');
    expect(externalJson).not.toContain('TAREA INTERNA');
    expect(externalJson).not.toContain('Persona interna');
    expect(externalJson).not.toContain('estimatedHours');
    expect(external).not.toHaveProperty('demoLink');
    expect(external).not.toHaveProperty('testEnvironmentLink');
    expect(external).not.toHaveProperty('figmaLink');
    expect(external).not.toHaveProperty('documentationLink');
    // Esos campos son los mismos que emplea PMO en Vista Cliente,
    // pero llegan por el endpoint del portal sujeto a sus grants.
    expect(external).toHaveProperty('impactBeforeHours', 24);
    expect(external).toHaveProperty('impactBeforePeople', '3 personas');
    expect(external).toHaveProperty('impactBeforeDuration', '3 días laborales');
    expect(external).toHaveProperty('impactBeforeModality', 'Planillas Excel');
    expect(external).toHaveProperty('impactAfterHours', 2);
    expect(external).toHaveProperty('impactAfterPeople', '1 persona');
    expect(external).toHaveProperty('impactAfterDuration', 'Mismo día');
    expect(external).toHaveProperty('impactAfterModality', 'Tablero automático');
    expect(external).toHaveProperty('contractAmount', 180);
  });
});
