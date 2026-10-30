import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  createQuotationVersionSchema, updateQuotationDraftSchema, quotationReconciliationReviewSchema,
  type CreateQuotationVersionInput, type ProjectQuotation, type QuotationVersion, type UpdateQuotationDraftInput, type QuotationTransferPreview, type QuotationReconciliationReview, type SavedQuotationReconciliationReview,
} from '@kora/contracts';
import { CurrentUser, type RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import { RequireAnyPermission } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { ManageQuotationDraftsUseCase } from '../application/use-cases/manage-quotation-drafts.use-case';

/**
 * API comercial separada de /poc/*. Gestiona borradores y actas append-only
 * de discusión. Envío, aprobación y traspaso siguen SIN implementar.
 */
@Controller('estimations/projects/:projectId/quotation')
export class QuotationController {
  constructor(private readonly drafts: ManageQuotationDraftsUseCase) {}

  @Get()
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  get(@Param('projectId', ParseUUIDPipe) projectId: string, @CurrentUser() actor: RequestUser): Promise<ProjectQuotation | null> {
    return this.drafts.get(projectId, actor);
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
