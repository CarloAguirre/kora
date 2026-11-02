import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  generateEstimationPocSchema, createQuotationVersionSchema, updateQuotationDraftSchema, quotationReconciliationReviewSchema, assessQuotationReconciliationSchema,
  type GenerateEstimationPocInput, type CreateQuotationVersionInput, type ProjectQuotation, type QuotationVersion, type UpdateQuotationDraftInput, type QuotationTransferPreview, type QuotationCommercialPreflight, type QuotationCommercialDossier, type QuotationReconciliationReview, type SavedQuotationReconciliationReview, type AssessQuotationReconciliationInput, type SavedQuotationReviewAssessment,
} from '@kora/contracts';
import { CurrentUser, type RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import { RequireAnyPermission } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { ManageQuotationDraftsUseCase } from '../application/use-cases/manage-quotation-drafts.use-case';
import { GenerateEstimationPocProposalUseCase } from '../application/use-cases/generate-estimation-poc-proposal.use-case';
import { GetEstimationQuestionnaireDefinitionUseCase } from '../application/use-cases/get-estimation-questionnaire-definition.use-case';
import { validateFixedQuestionnaireAnswers } from '../application/validate-estimation-questionnaire';

/**
 * API comercial separada de /poc/*. Gestiona borradores y actas append-only
 * de discusión. Envío, aprobación y traspaso siguen SIN implementar.
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
  @Post('versions/ai-poc')
  @HttpCode(HttpStatus.CREATED)
  @RequireAnyPermission('projects:manage')
  async createAiPoc(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(generateEstimationPocSchema)) input: GenerateEstimationPocInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<QuotationVersion> {
    if (input.projectId !== projectId ||
        input.driveFolderUrl !== 'https://drive.google.com/drive/folders/kora-poc-fallback') {
      throw new BadRequestException('La simulación documental solo admite la fuente KDM explícita.');
    }
    validateFixedQuestionnaireAnswers(this.questionnaire.execute(), input.answers);
    await this.drafts.authorizeAiPoc(projectId, actor);
    const proposal = await this.generator.execute(input);
    if (proposal.provider !== 'gemini' || proposal.sourceMode !== 'poc_simulated' ||
        proposal.documentsAnalyzed < 1) {
      throw new BadRequestException(
        'No se generó una propuesta válida con Gemini y el PDF KDM de demostración.',
      );
    }
    return this.drafts.createAiPocDraft(projectId, actor, proposal, input.answers);
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
