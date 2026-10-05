import { describe, expect, it, vi } from 'vitest';
import { GetProjectUseCase } from './get-project.use-case';
import type { ProjectRepository } from '../../domain/repositories/project.repository';
import type { ProjectTeamMemberRepository } from '../../domain/repositories/project-team-member.repository';
import type { ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import type { ProjectObservationRepository } from '../../domain/repositories/project-observation.repository';
import type { ProjectModuleRepository } from '../../domain/repositories/project-module.repository';
import type { ProjectPaymentMilestoneRepository } from '../../domain/repositories/project-payment-milestone.repository';
import type { ProjectUserReader } from '../ports/project-user-reader.port';
import type { ProjectClientReader } from '../ports/project-client-reader.port';
import type { ProjectContactReader } from '../ports/project-contact-reader.port';
import type { ProjectHourEntryReader } from '../ports/project-hour-entry-reader.port';
import type { ProjectActivityReader } from '../ports/project-activity-reader.port';
import { FixedClock } from '../../../../test/fakes';

class FakeProjectRepository implements Partial<ProjectRepository> {
  findById = vi.fn().mockResolvedValue(null);
  findBySlug = vi.fn().mockResolvedValue(null);
}

const NEVER_USED = {} as never;

function buildUseCase(projects: FakeProjectRepository) {
  return new GetProjectUseCase(
    projects as unknown as ProjectRepository,
    NEVER_USED as ProjectTeamMemberRepository,
    NEVER_USED as ProjectTeamRepository,
    NEVER_USED as ProjectObservationRepository,
    NEVER_USED as ProjectModuleRepository,
    NEVER_USED as ProjectPaymentMilestoneRepository,
    NEVER_USED as ProjectUserReader,
    NEVER_USED as ProjectClientReader,
    NEVER_USED as ProjectContactReader,
    NEVER_USED as ProjectHourEntryReader,
    NEVER_USED as ProjectActivityReader,
    new FixedClock(),
  );
}

/**
 * `GET /projects/:id` acepta UUID o slug. Fija qué método del repositorio se
 * llama según la forma del valor — sin esto, un test que solo mirara "hay
 * error NotFound" hubiera seguido pasando aunque la resolución por slug se
 * rompiera por completo.
 */
describe('GetProjectUseCase — resolución por id o slug', () => {
  it('con un UUID, busca por id y no por slug', async () => {
    const projects = new FakeProjectRepository();
    const useCase = buildUseCase(projects);

    await useCase.execute({ projectId: '11111111-1111-4111-8111-111111111111', actorUserId: 'u1', actorPermissions: ['projects:read'] });

    expect(projects.findById).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(projects.findBySlug).not.toHaveBeenCalled();
  });

  it('con un slug, busca por slug y no por id', async () => {
    const projects = new FakeProjectRepository();
    const useCase = buildUseCase(projects);

    await useCase.execute({ projectId: 'rediseno-web', actorUserId: 'u1', actorPermissions: ['projects:read'] });

    expect(projects.findBySlug).toHaveBeenCalledWith('rediseno-web');
    expect(projects.findById).not.toHaveBeenCalled();
  });
});
