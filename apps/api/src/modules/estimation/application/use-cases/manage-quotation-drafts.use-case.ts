import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { buildReconciliationReview, isQuotationDraftEligibleProject } from '@kora/contracts';
import { isDeepStrictEqual } from 'node:util';
import type {
  CreateQuotationVersionInput, Permission, ProjectQuotation, QuotationVersion, UpdateQuotationDraftInput, QuotationTransferPreview, QuotationReconciliationReview, SavedQuotationReconciliationReview, AssessQuotationReconciliationInput, SavedQuotationReviewAssessment,
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

  async listReconciliationAssessments(
    projectId: string, versionId: string, actor: QuotationActor,
  ): Promise<SavedQuotationReviewAssessment[]> {
    await this.authorize(projectId, actor, false);
    const quotation = await this.repository.getByProjectId(projectId);
    if (!quotation?.versions.some((version) => version.id === versionId)) {
      throw new NotFoundException('La versión de cotización no pertenece al proyecto.');
    }
    return this.repository.listReconciliationAssessments(projectId, versionId);
  }

  async assessReconciliationReview(
    projectId: string, versionId: string, actor: QuotationActor,
    input: AssessQuotationReconciliationInput,
  ): Promise<SavedQuotationReviewAssessment> {
    await this.authorize(projectId, actor, true);
    // La revisión técnica y la aprobación de negocio son cosas diferentes.
    // Restricción preventiva mientras D02/D04-D06 continúen sin ratificarse.
    if (!actor.permissions.includes('projects:manage')) {
      throw new ForbiddenException('La evaluación técnica requiere permiso de administración de proyectos.');
    }
    const quotation = await this.repository.getByProjectId(projectId);
    const version = quotation?.versions.find((candidate) => candidate.id === versionId);
    if (!version) throw new NotFoundException('Versión ajena a esta cotización.');
    if (version.status !== 'draft' || version.revision !== input.versionRevision) {
      throw new ConflictException('La revisión comercial cambió. Actualiza la página.');
    }
    const reviews = await this.repository.listReconciliationReviews(projectId, versionId);
    const saved = reviews[0];
    if (!saved || saved.id !== input.reviewId) {
      throw new ConflictException('Sólo puede revisarse técnicamente la última acta guardada.');
    }
    if (saved.actorUserId === actor.id) {
      throw new ForbiddenException('No puedes evaluar un acta guardada por ti mismo.');
    }
    if (saved.review.versionRevision !== input.versionRevision) {
      throw new ConflictException('El acta corresponde a una revisión comercial anterior.');
    }
    const assessments = await this.repository.listReconciliationAssessments(projectId, versionId);
    if (assessments.some((item) => item.reviewId === saved.id)) {
      throw new ConflictException('El acta ya tiene una evaluación técnica registrada.');
    }

    const operational = await this.repository.getOperationalSnapshot(projectId);
    if (!operational) throw new NotFoundException('No se encontró el proyecto operativo.');
    const preview = buildQuotationTransferPreview(version, operational, new Date().toISOString());
    const choices = {
      modules: Object.fromEntries(saved.review.moduleDecisions.map((item) => [
        item.moduleIndex,
        { decision: item.decision, targetId: item.targetModuleId, note: item.note },
      ])),
      activities: Object.fromEntries(saved.review.moduleDecisions.flatMap((item) =>
        item.activityDecisions.map((activity) => [
          activity.wbs,
          { decision: activity.decision, targetId: activity.targetTaskId, note: activity.note },
        ]))),
    };
    let canonical: QuotationReconciliationReview;
    try {
      canonical = buildReconciliationReview(preview, choices, saved.review.exportedAt);
    } catch {
      throw new ConflictException('Las correspondencias del acta ya no coinciden con el proyecto.');
    }
    if (!isDeepStrictEqual(
      { ...canonical, previewCalculatedAt: saved.review.previewCalculatedAt },
      saved.review,
    )) {
      throw new ConflictException('El proyecto cambió desde el registro del acta. Debe generarse una nueva.');
    }

    const unresolved = saved.review.issues.some((issue) =>
      /^(MODULO_PENDIENTE|ACTIVIDAD_PENDIENTE|MODULO_SIN_FUNDAMENTO|DESTINO_COMPARTIDO|TAREA_COMPARTIDA|EDT_DESACTUALIZADA|HH_DIVERGENTES):/.test(issue));
    if (input.decision === 'reviewed_for_discussion' && unresolved) {
      throw new ConflictException(
        'Hay decisiones incompletas o HH divergentes. Solicita cambios o registra otra acta.',
      );
    }
    // Importante: se conserva toda advertencia de HH históricas/hitos pagados;
    // el resultado reviewed_for_discussion NO concede aprobación comercial.
    const result = await this.repository.appendReconciliationAssessment(
      projectId, versionId, actor.id, input,
    );
    if (!result) {
      throw new ConflictException('El acta ya fue evaluada o cambió durante la revisión.');
    }
    return result;
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
