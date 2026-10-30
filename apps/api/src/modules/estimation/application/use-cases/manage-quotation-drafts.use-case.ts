import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { isQuotationDraftEligibleProject } from '@kora/contracts';
import type {
  CreateQuotationVersionInput, Permission, ProjectQuotation, QuotationVersion, UpdateQuotationDraftInput,
} from '@kora/contracts';
import { QUOTATION_REPOSITORY, type QuotationProjectScope, type QuotationRepository } from '../../domain/repositories/quotation.repository';

export interface QuotationActor {
  id: string;
  permissions: readonly Permission[];
}

@Injectable()
export class ManageQuotationDraftsUseCase {
  constructor(@Inject(QUOTATION_REPOSITORY) private readonly repository: QuotationRepository) {}

  private async authorize(projectId: string, actor: QuotationActor, write: boolean): Promise<QuotationProjectScope> {
    const project = await this.repository.getProjectScope(projectId);
    if (!project || project.type !== 'development') throw new NotFoundException('Proyecto no encontrado.');
    const allowed = actor.permissions.includes('projects:manage') ||
      (actor.permissions.includes('projects:read_assigned') && project.leaderUserId === actor.id);
    if (!allowed) throw new ForbiddenException('No tienes acceso comercial a esta cotización.');
    if (write && !isQuotationDraftEligibleProject(project)) {
      throw new ConflictException('El proyecto no admite borradores comerciales en esta etapa y estado.');
    }
    return project;
  }

  async get(projectId: string, actor: QuotationActor): Promise<ProjectQuotation | null> {
    await this.authorize(projectId, actor, false);
    return this.repository.getByProjectId(projectId);
  }

  async create(projectId: string, actor: QuotationActor, input: CreateQuotationVersionInput): Promise<QuotationVersion> {
    await this.authorize(projectId, actor, true);
    return this.repository.createDraft(projectId, actor.id, input);
  }

  async update(projectId: string, versionId: string, actor: QuotationActor, input: UpdateQuotationDraftInput): Promise<QuotationVersion> {
    await this.authorize(projectId, actor, true);
    const updated = await this.repository.updateDraft(projectId, versionId, actor.id, input);
    if (!updated) throw new ConflictException('La versión no existe, está bloqueada o fue editada por otra sesión. Actualiza antes de continuar.');
    return updated;
  }
}
