import { Inject, Injectable } from '@nestjs/common';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../../projects/domain/repositories/project.repository';
import type { TicketProjectReader, TicketProjectReference } from '../../application/ports/ticket-project-reader.port';

@Injectable()
export class ProjectsModuleTicketProjectReader implements TicketProjectReader {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository) {}

  async findById(projectId: string): Promise<TicketProjectReference | null> {
    const project = await this.projects.findById(projectId);
    if (!project || project.isDeleted) return null;
    return { id: project.id, name: project.name, status: project.status };
  }

  isProjectApprover(projectId: string, actorUserId: string, assigneeUserId: string | null): Promise<boolean> {
    return this.projects.isProjectLeaderOrTeamLeaderOfMember(projectId, actorUserId, assigneeUserId);
  }

  findHhApprovers(projectId: string, assigneeUserId: string | null): Promise<{ id: string; fullName: string }[]> {
    return this.projects.findApproverCandidatesForMember(projectId, assigneeUserId);
  }
}
