import { Inject, Injectable } from '@nestjs/common';
import type { ProjectStatus, ProjectType } from '@kora/contracts';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../../projects/domain/repositories/project.repository';
import type { LinkableProjectReference, TicketProjectReader, TicketProjectReference } from '../../application/ports/ticket-project-reader.port';

@Injectable()
export class ProjectsModuleTicketProjectReader implements TicketProjectReader {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository) {}

  async findById(projectId: string): Promise<TicketProjectReference | null> {
    const project = await this.projects.findById(projectId);
    if (!project || project.isDeleted) return null;
    return { id: project.id, name: project.name, status: project.status, type: project.type, clientId: project.clientId };
  }

  async findManyByIds(projectIds: readonly string[]): Promise<TicketProjectReference[]> {
    const found = await Promise.all(projectIds.map((id) => this.findById(id)));
    return found.filter((project): project is TicketProjectReference => project !== null);
  }

  async findLinkableByClient(
    clientId: string,
    type: ProjectType,
    status?: readonly ProjectStatus[],
  ): Promise<LinkableProjectReference[]> {
    const page = await this.projects.search(
      { clientId, type, status },
      { page: 1, pageSize: 500 },
      { field: 'name', direction: 'asc' },
    );
    return page.items.map((item) => ({ id: item.id, name: item.name }));
  }

  isProjectApprover(projectId: string, actorUserId: string, assigneeUserId: string | null): Promise<boolean> {
    return this.projects.isProjectLeaderOrTeamLeaderOfMember(projectId, actorUserId, assigneeUserId);
  }

  findHhApprovers(projectId: string, assigneeUserId: string | null): Promise<{ id: string; fullName: string }[]> {
    return this.projects.findApproverCandidatesForMember(projectId, assigneeUserId);
  }
}
