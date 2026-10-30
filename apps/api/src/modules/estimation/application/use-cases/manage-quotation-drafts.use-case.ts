import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { buildReconciliationReview, isQuotationDraftEligibleProject } from '@kora/contracts';
import { isDeepStrictEqual } from 'node:util';
import type {
  CreateQuotationVersionInput, Permission, ProjectQuotation, QuotationVersion, UpdateQuotationDraftInput, QuotationTransferPreview, QuotationReconciliationReview, SavedQuotationReconciliationReview,
} from '@kora/contracts';
import { buildQuotationTransferPreview } from '../../domain/quotation-transfer-preview';
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

  async getTransferPreview(
    projectId: string, versionId: string, actor: QuotationActor,
  ): Promise<QuotationTransferPreview> {
    // Lectura comercial autorizada; la vista previa NO requiere permiso de
    // escritura ni puede alterar proyectos por error.
    await this.authorize(projectId, actor, false);
    const quotation = await this.repository.getByProjectId(projectId);
    const version = quotation?.versions.find((item) => item.id === versionId);
    if (!version) throw new NotFoundException('Versión de cotización no encontrada en este proyecto.');
    const operational = await this.repository.getOperationalSnapshot(projectId);
    if (!operational) throw new NotFoundException('Proyecto operativo no encontrado.');
    return buildQuotationTransferPreview(version, operational, new Date().toISOString());
  }

  async listReconciliationReviews(
    projectId: string, versionId: string, actor: QuotationActor,
  ): Promise<SavedQuotationReconciliationReview[]> {
    await this.authorize(projectId, actor, false);
    const quotation = await this.repository.getByProjectId(projectId);
    if (!quotation?.versions.some((version) => version.id === versionId)) {
      throw new NotFoundException('La versión de cotización no pertenece al proyecto.');
    }
    return this.repository.listReconciliationReviews(projectId, versionId);
  }

  async saveReconciliationReview(
    projectId: string, versionId: string, actor: QuotationActor,
    review: QuotationReconciliationReview,
  ): Promise<SavedQuotationReconciliationReview> {
    // Se guarda exclusivamente un borrador de DISCUSIÓN; no se aprueban
    // correspondencias ni se habilita el traspaso de HH o facturas.
    await this.authorize(projectId, actor, true);
    if (JSON.stringify(review).length > 90_000) {
      throw new BadRequestException('El acta supera el tamaño máximo admitido (90 KB).');
    }
    if (review.projectId !== projectId || review.versionId !== versionId) {
      throw new ConflictException('La identificación del acta no coincide con el proyecto y versión.');
    }
    const quotation = await this.repository.getByProjectId(projectId);
    const version = quotation?.versions.find((item) => item.id === versionId);
    if (!version) throw new NotFoundException('La versión no pertenece a esta cotización.');
    if (version.status !== 'draft' || version.revision !== review.versionRevision ||
        version.versionNumber !== review.versionNumber) {
      throw new ConflictException('La versión cambió o dejó de ser editable. Actualiza el análisis.');
    }
    const operational = await this.repository.getOperationalSnapshot(projectId);
    if (!operational) throw new NotFoundException('Estado operativo no encontrado.');
    const preview = buildQuotationTransferPreview(version, operational, new Date().toISOString());
    if (preview.edtReconciliation.source === 'no_analysis') {
      throw new ConflictException('Esta versión no tiene EDT para preparar un acta.');
    }

    // Reconstrucción CANÓNICA desde el preflight del servidor. Impide enviar
    // módulos/tareas de otro proyecto, ocultar advertencias o falsificar HH.
    const choices = {
      modules: Object.fromEntries(review.moduleDecisions.map((item) => [
        item.moduleIndex,
        { decision: item.decision, targetId: item.targetModuleId, note: item.note },
      ])),
      activities: Object.fromEntries(review.moduleDecisions.flatMap((item) =>
        item.activityDecisions.map((activity) => [
          activity.wbs,
          { decision: activity.decision, targetId: activity.targetTaskId, note: activity.note },
        ]))),
    };
    let canonical: QuotationReconciliationReview;
    try {
      canonical = buildReconciliationReview(preview, choices, review.exportedAt);
    } catch {
      throw new ConflictException('El acta contiene vinculaciones incompatibles con el estado operativo actual.');
    }
    // La fecha de lectura anterior es histórica; el resto se comprueba
    // contra un preflight RECIÉN consultado, incluidas sus advertencias.
    const checked = { ...canonical, previewCalculatedAt: review.previewCalculatedAt };
    if (!isDeepStrictEqual(checked, review)) {
      throw new ConflictException('Acta desactualizada o alterada. Refresca el preflight y revisa las decisiones.');
    }

    const created = await this.repository.appendReconciliationReview(projectId, versionId, actor.id, review);
    if (!created) throw new ConflictException('La versión cambió durante el guardado. Actualiza e inténtalo nuevamente.');
    return created;
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
