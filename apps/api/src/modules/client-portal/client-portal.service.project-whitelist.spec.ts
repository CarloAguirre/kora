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
  it('publica entregas, pero jamás segmentos ni tareas operativas internas', () => {
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
        segments: [{ id: 'segmento-privado', name: 'HH INTERNAS: no divulgar', startDate: '2026-10-01', endDate: '2026-11-01' }],
        tasks: [{ id: 'tarea-privada', name: 'TAREA INTERNA SECRET', date: '2026-10-04' }],
        deliveries: [
          { id: 'entrega-1', name: 'Informe comprometido', teamName: 'DEV',
            estimatedDate: '2026-11-18', status: 'approved' },
        ],
      }],
    } as unknown as ProjectDetail;
    const external = (
      service as unknown as {
        publicProject(input: ProjectDetail): {
          modules: Array<{ id: string; name: string; deliveries: Array<{ status: string }> }>;
        };
      }
    ).publicProject(detail);
    expect(external.modules).toEqual([{
      id: 'fase-1',
      name: 'Planificación',
      deliveries: [{ id: 'entrega-1', name: 'Informe comprometido',
        teamName: 'DEV', estimatedDate: '2026-11-18', status: 'approved' }],
    }]);
    expect(JSON.stringify(external)).not.toContain('segmento-privado');
    expect(JSON.stringify(external)).not.toContain('tarea-privada');
    expect(JSON.stringify(external)).not.toContain('TAREA INTERNA');
    expect(external).toHaveProperty('contractAmount', 180);
  });
});
