import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  applyQuotationPlanningSchema, generateAiDemoQuotationSchema, createQuotationVersionSchema, updateQuotationDraftSchema, quotationReconciliationReviewSchema, assessQuotationReconciliationSchema,
  quotationRevisionActionSchema, approveClientQuotationSchema, transferApprovedQuotationSchema,
  type QuotationRevisionActionInput, type ApproveClientQuotationInput, type TransferApprovedQuotationInput, type QuotationTransferResult,
  type ApplyQuotationPlanningInput, type AppliedQuotationPlanning, type GenerateAiDemoQuotationInput, type CreateQuotationVersionInput, type ProjectQuotation, type QuotationVersion, type UpdateQuotationDraftInput, type QuotationTransferPreview, type QuotationCommercialPreflight, type QuotationCommercialDossier, type QuotationReconciliationReview, type SavedQuotationReconciliationReview, type AssessQuotationReconciliationInput, type SavedQuotationReviewAssessment,
} from '@kora/contracts';
import { CurrentUser, type RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import { RequireAnyPermission } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { ManageQuotationDraftsUseCase } from '../application/use-cases/manage-quotation-drafts.use-case';
import { GenerateEstimationPocProposalUseCase } from '../application/use-cases/generate-estimation-poc-proposal.use-case';
import { GetEstimationQuestionnaireDefinitionUseCase } from '../application/use-cases/get-estimation-questionnaire-definition.use-case';
import { validateQuestionnaireAnswers } from '../application/validate-estimation-questionnaire';

/**
 * API comercial separada de /poc/*. Además de borradores y actas,
 * permite aplicar SOLO el baseline técnico inicial al Roadmap de un prospecto
 * vacío; envío/aprobación contractual, facturación y recotización histórica
 * permanecen sin implementar.
 */
@Controller('estimations/projects/:projectId/quotation')
export class QuotationController {
  constructor(
    private readonly drafts: ManageQuotationDraftsUseCase,
    private readonly generator: GenerateEstimationPocProposalUseCase,
    private readonly questionnaire: GetEstimationQuestionnaireDefinitionUseCase,
  ) {}

  @Get()
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  get(@Param('projectId', ParseUUIDPipe) projectId: string, @CurrentUser() actor: RequestUser): Promise<ProjectQuotation | null> {
    return this.drafts.get(projectId, actor);
  }

  @Get('versions/:versionId/commercial-dossier')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  getCommercialDossier(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<QuotationCommercialDossier> {
    return this.drafts.getCommercialDossier(projectId, versionId, actor);
  }

  @Get('versions/:versionId/commercial-preflight')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  getCommercialPreflight(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<QuotationCommercialPreflight> {
    return this.drafts.getCommercialPreflight(projectId, versionId, actor);
  }

  @Get('versions/:versionId/transfer-preview')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  getTransferPreview(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<QuotationTransferPreview> {
    return this.drafts.getTransferPreview(projectId, versionId, actor);
  }

  @Get('versions/:versionId/reconciliation-reviews')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  listReconciliationReviews(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<SavedQuotationReconciliationReview[]> {
    return this.drafts.listReconciliationReviews(projectId, versionId, actor);
  }

  @Post('versions/:versionId/reconciliation-reviews')
  @HttpCode(HttpStatus.CREATED)
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  saveReconciliationReview(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body(new ZodValidationPipe(quotationReconciliationReviewSchema)) review: QuotationReconciliationReview,
    @CurrentUser() actor: RequestUser,
  ): Promise<SavedQuotationReconciliationReview> {
    return this.drafts.saveReconciliationReview(projectId, versionId, actor, review);
  }

  @Get('versions/:versionId/reconciliation-assessments')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  listReconciliationAssessments(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<SavedQuotationReviewAssessment[]> {
    return this.drafts.listReconciliationAssessments(projectId, versionId, actor);
  }

  @Post('versions/:versionId/reconciliation-assessments')
  @HttpCode(HttpStatus.CREATED)
  @RequireAnyPermission('projects:manage')
  assessReconciliationReview(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body(new ZodValidationPipe(assessQuotationReconciliationSchema)) input: AssessQuotationReconciliationInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<SavedQuotationReviewAssessment> {
    return this.drafts.assessReconciliationReview(projectId, versionId, actor, input);
  }

  /** Fuente documental KDM explícita. Gemini procesa el documento real del
   * fixture; se almacena un borrador auditado, sin venta ni aprobación. */
  @Get('applied-plan')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  getAppliedPlan(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<AppliedQuotationPlanning | null> {
    return this.drafts.getAppliedPlanningBaseline(projectId, actor);
  }

  @Post('versions/:versionId/apply-plan')
  @RequireAnyPermission('projects:manage')
  @HttpCode(HttpStatus.OK)
  applyPlan(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body(new ZodValidationPipe(applyQuotationPlanningSchema)) input: ApplyQuotationPlanningInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<AppliedQuotationPlanning> {
    return this.drafts.applyPlanningBaseline(projectId, versionId, actor, input);
  }

  @Post('versions/ai-poc')
  @HttpCode(HttpStatus.CREATED)
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  async createAiPoc(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(generateAiDemoQuotationSchema)) input: GenerateAiDemoQuotationInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<QuotationVersion> {
    if (input.projectId !== projectId ||
        input.driveFolderUrl !== 'https://drive.google.com/drive/folders/kora-poc-fallback') {
      throw new BadRequestException('La simulación documental solo admite la fuente KDM explícita.');
    }
    if (input.dynamicQuestions.some((question) =>
      question.kind !== 'dynamic' || question.sourceRefs.length === 0 ||
      question.sourceRefs.some((ref) => ref.sourceId !== 'kora-poc-requerimiento-kdm')
    )) {
      throw new BadRequestException('Las preguntas dinámicas deben acreditar la fuente KDM.');
    }
    validateQuestionnaireAnswers(
      this.questionnaire.execute(), input.answers, input.dynamicQuestions,
    );
    // Usar el catálogo real activo, leído en backend tras comprobar permisos.
    // Ninguna identidad de equipo proviene de un nombre libre de Gemini.
    const activeTeams = await this.drafts.listActiveQuotationTeams(projectId, actor);
    if (!activeTeams.length) {
      throw new BadRequestException('No existen equipos activos en Kora para generar la cotización.');
    }
    const proposal = await this.generator.execute(input, activeTeams);
    if (proposal.provider !== 'gemini' || proposal.sourceMode !== 'poc_simulated' ||
        proposal.documentsAnalyzed < 1) {
      throw new BadRequestException(
        'No se generó una propuesta válida con Gemini y el PDF KDM de demostración.',
      );
    }
    const validIds = new Set(activeTeams.map((team) => team.teamId));
    if (proposal.roles.some((role) => !role.teamId || !validIds.has(role.teamId))) {
      throw new BadRequestException('Gemini propuso un perfil sin equipo activo de Kora.');
    }
    const edt = await this.generator.generateEdt(input, proposal, activeTeams);
    // La EDT detallada determina las HH finales; la primera llamada propone
    // perfiles/capacidad, pero no impone un presupuesto a las actividades.
    const reconciled = this.generator.reconcileProposalWithEdt(proposal, edt);
    if (reconciled.roles.some((role) => !role.teamId || !validIds.has(role.teamId))) {
      throw new BadRequestException('La propuesta IA no asignó todos los perfiles a equipos activos de Kora.');
    }
    const roleTeamIds = Object.fromEntries(
      reconciled.roles.map((role) => [role.role, role.teamId!]),
    );
    return this.drafts.createAiPocDraft(
      projectId, actor, reconciled, input.answers, input.dynamicQuestions, edt,
      input.confirmedUnderstanding, roleTeamIds,
    );
  }

  @Post('versions')
  @HttpCode(HttpStatus.CREATED)
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(createQuotationVersionSchema)) body: CreateQuotationVersionInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<QuotationVersion> {
    return this.drafts.create(projectId, actor, body);
  }

  @Post('versions/:versionId/accept-ai')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  acceptAi(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body(new ZodValidationPipe(quotationRevisionActionSchema)) input: QuotationRevisionActionInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<QuotationVersion> {
    return this.drafts.acceptAiProposal(projectId, versionId, actor, input);
  }

  @Post('versions/:versionId/mark-sent')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  markSent(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body(new ZodValidationPipe(quotationRevisionActionSchema)) input: QuotationRevisionActionInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<QuotationVersion> {
    return this.drafts.markSent(projectId, versionId, actor, input);
  }

  @Post('versions/:versionId/approve-client')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  approveClient(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body(new ZodValidationPipe(approveClientQuotationSchema)) input: ApproveClientQuotationInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<QuotationVersion> {
    return this.drafts.approveClient(projectId, versionId, actor, input);
  }

  @Post('versions/:versionId/transfer-approved')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  transferApproved(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body(new ZodValidationPipe(transferApprovedQuotationSchema)) input: TransferApprovedQuotationInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<QuotationTransferResult> {
    return this.drafts.transferApproved(projectId, versionId, actor, input);
  }

  @Delete('versions/:versionId')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  deleteVersion(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Query('revision', ParseIntPipe) revision: number,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ deletedVersionId: string }> {
    return this.drafts.deleteVersion(projectId, versionId, revision, actor);
  }

  @Patch('versions/:versionId')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body(new ZodValidationPipe(updateQuotationDraftSchema)) body: UpdateQuotationDraftInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<QuotationVersion> {
    return this.drafts.update(projectId, versionId, actor, body);
  }
}
