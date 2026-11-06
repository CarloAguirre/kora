import { Body, Controller, Get, Post, Query, Res, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  analyzeEstimationPocSchema,
  generateEstimationPocSchema,
  inventoryEstimationDriveSchema,
  listEstimationDriveFilesSchema,
  resolveEstimationDriveFolderSchema,
  type AnalyzeEstimationPocInput,
  type EstimationDriveFolderListing,
  type EstimationDriveFolderResolution,
  type EstimationDriveInventory,
  type EstimationPocAnalysis,
  type EstimationPocProposal,
  type EstimationQuestionnaireDefinition,
  type GenerateEstimationPocInput,
  type InventoryEstimationDriveInput,
  type ListEstimationDriveFilesInput,
  type ResolveEstimationDriveFolderInput,
} from '@kora/contracts';
import { CurrentUser, type RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import { AppConfigService } from '../../../config/app-config.service';
import { GoogleDriveOAuthPocService } from '../../../shared/infrastructure/auth/google-drive-oauth-poc.service';
import { extractDriveFolderId } from '../application/drive-source-selection';
import { resolveAuthorizedDriveReader } from '../infrastructure/drive/resolve-authorized-drive-reader';
import { RequireAnyPermission, RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { ManageQuotationDraftsUseCase } from '../application/use-cases/manage-quotation-drafts.use-case';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { AnalyzeEstimationPocUseCase } from '../application/use-cases/analyze-estimation-poc.use-case';
import { GenerateEstimationPocProposalUseCase } from '../application/use-cases/generate-estimation-poc-proposal.use-case';
import { GetEstimationQuestionnaireDefinitionUseCase } from '../application/use-cases/get-estimation-questionnaire-definition.use-case';
import { InventoryEstimationDriveUseCase } from '../application/use-cases/inventory-estimation-drive.use-case';
import { ListEstimationDriveFilesUseCase } from '../application/use-cases/list-estimation-drive-files.use-case';
import { ResolveEstimationDriveFolderUseCase } from '../application/use-cases/resolve-estimation-drive-folder.use-case';
import { validateFixedQuestionnaireAnswers } from '../application/validate-estimation-questionnaire';

const startDriveOAuthPocSchema = z.object({
  projectId: z.uuid(),
  driveFolderUrl: z.url().max(2048),
});

/** Diagnóstico aislado: esta respuesta nunca contiene tokens de Google. */
export interface StartDriveOAuthPocResponse {
  authorizationUrl: string;
}

@Controller('estimations')
export class EstimationController {
  constructor(
    private readonly getQuestionnaireDefinition: GetEstimationQuestionnaireDefinitionUseCase,
    private readonly analyzePoc: AnalyzeEstimationPocUseCase,
    private readonly generatePocProposal: GenerateEstimationPocProposalUseCase,
    private readonly listDriveFiles: ListEstimationDriveFilesUseCase,
    private readonly resolveDriveFolder: ResolveEstimationDriveFolderUseCase,
    private readonly inventoryDrive: InventoryEstimationDriveUseCase,
    private readonly quotationDrafts: ManageQuotationDraftsUseCase,
    private readonly driveOAuthPoc: GoogleDriveOAuthPocService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * PoC: solo comprueba OAuth y lectura de una carpeta real de Drive.
   * No guarda tokens, no altera la sesión Google/Kora y no cambia el lector
   * definitivo de documentos hasta completar autorización y persistencia.
   */
  @Get('drive/oauth-poc/status')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  driveOAuthPocStatus(): { enabled: boolean; serviceAccountEnabled: boolean } {
    return { enabled: this.config.googleDriveOauthPocEnabled && this.config.google.enabled,
      serviceAccountEnabled: this.config.googleDrive.enabled };
  }

  @Post('drive/oauth-poc/start')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  async startDriveOAuthPoc(
    @Body(new ZodValidationPipe(startDriveOAuthPocSchema)) input: z.infer<typeof startDriveOAuthPocSchema>,
    @CurrentUser() actor: RequestUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StartDriveOAuthPocResponse> {
    if (!this.config.googleDriveOauthPocEnabled || !this.config.google.enabled) {
      throw new ServiceUnavailableException('La prueba OAuth de Drive no está habilitada en este entorno.');
    }
    await this.quotationDrafts.authorizeAiPoc(input.projectId, actor);
    const folderId = extractDriveFolderId(input.driveFolderUrl);
    if (!folderId || folderId === 'kora-poc-fallback') {
      throw new BadRequestException('Selecciona una carpeta real de Google Drive para la prueba.');
    }
    const { state, authorizationUrl } = this.driveOAuthPoc.start(actor.id, folderId);
    void reply.header('Cache-Control', 'no-store');
    void reply.setCookie('kora_drive_poc_state', state, {
      httpOnly: true, secure: this.config.isProduction, sameSite: 'lax',
      path: '/', maxAge: 300,
    });
    return { authorizationUrl };
  }

  /** Comprobación explícita para navegadores que pierden window.opener por COOP de Google. */
  @Get('drive/oauth-poc/access')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  async driveOAuthPocAccess(
    @Query(new ZodValidationPipe(startDriveOAuthPocSchema)) input: z.infer<typeof startDriveOAuthPocSchema>,
    @CurrentUser() actor: RequestUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ authorized: boolean }> {
    await this.quotationDrafts.authorizeAiPoc(input.projectId, actor);
    const id = extractDriveFolderId(input.driveFolderUrl);
    void reply.header('Cache-Control', 'no-store');
    return {
      authorized: Boolean(id && id !== 'kora-poc-fallback' &&
        (this.config.googleDrive.enabled ||
        this.driveOAuthPoc.getAuthorizedAccessToken(actor.id, id))),
    };
  }

  @Get('questionnaire-definition')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  definition(): EstimationQuestionnaireDefinition {
    return this.getQuestionnaireDefinition.execute();
  }

  @Post('drive/resolve')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  async driveResolve(
    @Body(new ZodValidationPipe(resolveEstimationDriveFolderSchema))
    input: ResolveEstimationDriveFolderInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<EstimationDriveFolderResolution> {
    await this.quotationDrafts.authorizeAiPoc(input.projectId, actor);
    return this.resolveDriveFolder.execute(input);
  }

  @Post('drive/inventory')
  @RequirePermissions('projects:manage')
  driveInventory(
    @Body(new ZodValidationPipe(inventoryEstimationDriveSchema))
    input: InventoryEstimationDriveInput,
  ): Promise<EstimationDriveInventory> {
    return this.inventoryDrive.execute(input);
  }

  @Post('drive/files')
  @RequirePermissions('projects:manage')
  driveFiles(
    @Body(new ZodValidationPipe(listEstimationDriveFilesSchema))
    input: ListEstimationDriveFilesInput,
  ): Promise<EstimationDriveFolderListing> {
    return this.listDriveFiles.execute(input);
  }

  @Post('poc/analyze')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  async analyze(
    @Body(new ZodValidationPipe(analyzeEstimationPocSchema)) input: AnalyzeEstimationPocInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<EstimationPocAnalysis> {
    await this.quotationDrafts.authorizeAiPoc(input.projectId, actor);
    return this.analyzePoc.execute(input, resolveAuthorizedDriveReader(
      input.driveFolderUrl, actor.id, this.config, this.driveOAuthPoc,
    ));
  }

  /**
   * R4-a: ruta estricta del nuevo flujo de cuestionario.
   * El endpoint PoC heredado se conserva para compatibilidad, pero la nueva
   * pantalla no permite enviar answers=[] ni IDs no definidos.
   */
  @Post('poc/proposal-answered')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  async proposalAnswered(
    @Body(new ZodValidationPipe(generateEstimationPocSchema)) input: GenerateEstimationPocInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<EstimationPocProposal> {
    await this.quotationDrafts.authorizeAiPoc(input.projectId, actor);
    validateFixedQuestionnaireAnswers(this.getQuestionnaireDefinition.execute(), input.answers);
    return this.generatePocProposal.execute(input);
  }

  /**
   * Segunda etapa de la PoC: genera la propuesta solo después de recibir las
   * respuestas del cuestionario. Las HH se calculan determinísticamente.
   */
  @Post('poc/proposal')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  async proposal(
    @Body(new ZodValidationPipe(generateEstimationPocSchema)) input: GenerateEstimationPocInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<EstimationPocProposal> {
    await this.quotationDrafts.authorizeAiPoc(input.projectId, actor);
    return this.generatePocProposal.execute(input);
  }
}
