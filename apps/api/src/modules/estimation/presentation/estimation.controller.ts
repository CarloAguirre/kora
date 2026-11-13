import { Body, Controller, Get, Header, Post, Query, Res, ServiceUnavailableException, BadRequestException, HttpException } from '@nestjs/common';
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
import { DRIVE_DISCOVERY_SESSION, GoogleDriveOAuthPocService } from '../../../shared/infrastructure/auth/google-drive-oauth-poc.service';
import { extractDriveFolderId } from '../application/drive-source-selection';
import { resolveAuthorizedDriveReader } from '../infrastructure/drive/resolve-authorized-drive-reader';
import { GoogleDriveFolderClient } from '../infrastructure/drive/google-drive-folder.client';
import {
  browseAuthorizedDriveFolder, browseDriveFolderInputSchema,
  type BrowseDriveFolderInput, type BrowseDriveFolderResult,
} from '../infrastructure/drive/browse-authorized-drive-folder';
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
  driveFolderUrl: z.url().max(2048).optional(),
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
   * Concesión OAuth temporal para la calculadora, separada del login de Kora.
   * El access token permanece exclusivamente en memoria del backend, ligado
   * a usuario+carpeta; no se devuelve al cliente ni se guarda en PostgreSQL.
   */
  @Get('drive/oauth-poc/status')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  driveOAuthPocStatus(): { enabled: boolean; serviceAccountEnabled: boolean } {
    return { enabled: !this.config.googleDrive.enabled &&
        this.config.googleDriveOauthPocEnabled && this.config.google.enabled,
      serviceAccountEnabled: this.config.googleDrive.enabled };
  }

  @Post('drive/oauth-poc/start')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  async startDriveOAuthPoc(
    @Body(new ZodValidationPipe(startDriveOAuthPocSchema)) input: z.infer<typeof startDriveOAuthPocSchema>,
    @CurrentUser() actor: RequestUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StartDriveOAuthPocResponse> {
    if (this.config.googleDrive.enabled ||
        !this.config.googleDriveOauthPocEnabled || !this.config.google.enabled) {
      throw new ServiceUnavailableException('La prueba OAuth de Drive no está habilitada en este entorno.');
    }
    await this.quotationDrafts.authorizeAiPoc(input.projectId, actor);
    const folderId = input.driveFolderUrl
      ? extractDriveFolderId(input.driveFolderUrl) : DRIVE_DISCOVERY_SESSION;
    if (!folderId || folderId === 'kora-poc-fallback') {
      throw new BadRequestException('Selecciona una carpeta real de Google Drive.');
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
    const id = input.driveFolderUrl
      ? extractDriveFolderId(input.driveFolderUrl) : DRIVE_DISCOVERY_SESSION;
    void reply.header('Cache-Control', 'no-store');
    // El permiso del service account NO demuestra consentimiento del usuario
    // para buscar en "mi Drive". Sin URL se exige su token OAuth delegado.
    const authorized = id === DRIVE_DISCOVERY_SESSION
      ? this.driveOAuthPoc.getAuthorizedAccessToken(actor.id, DRIVE_DISCOVERY_SESSION)
      : id && id !== 'kora-poc-fallback' && (
        this.config.googleDrive.enabled ||
        this.driveOAuthPoc.getAuthorizedAccessToken(actor.id, id) ||
        this.driveOAuthPoc.getAuthorizedAccessToken(actor.id, DRIVE_DISCOVERY_SESSION));
    return { authorized: Boolean(authorized) };
  }

  /**
   * Previsualiza exactamente los documentos que puede leer Gemini.
   * Ofrece carpetas hermanas y subcarpetas accesibles, sin exponer el token.
   */
  @Post('drive/folders/browse')
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  async browseDriveFolder(
    @Body(new ZodValidationPipe(browseDriveFolderInputSchema)) input: BrowseDriveFolderInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<BrowseDriveFolderResult> {
    await this.quotationDrafts.authorizeAiPoc(input.projectId, actor);
    return browseAuthorizedDriveFolder(input, actor.id, this.config, this.driveOAuthPoc);
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
    // Un OAuth de descubrimiento consulta el Drive del usuario conectado,
    // nunca la cuenta de servicio de otra organización por accidente.
    const delegated = this.config.googleDrive.enabled ? null :
      this.driveOAuthPoc.getAuthorizedAccessToken(actor.id, DRIVE_DISCOVERY_SESSION);
    return this.resolveDriveFolder.execute(input, delegated
      ? new GoogleDriveFolderClient(this.config, delegated) : undefined);
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

  /**
   * Canal SSE autenticado para el mismo análisis. El único trabajo del canal
   * es transportar resúmenes oficiales de Gemini y el JSON final; no expone
   * pensamientos internos ni requiere una segunda llamada al modelo.
   */
  @Post('poc/analyze/stream')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  async analyzeStream(
    @Body(new ZodValidationPipe(analyzeEstimationPocSchema)) input: AnalyzeEstimationPocInput,
    @CurrentUser() actor: RequestUser,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    // Antes de escribir una cabecera SSE, mantener el mismo control de acceso.
    await this.quotationDrafts.authorizeAiPoc(input.projectId, actor);
    const sourceReader = resolveAuthorizedDriveReader(
      input.driveFolderUrl, actor.id, this.config, this.driveOAuthPoc,
    );
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'Connection': 'keep-alive',
    });
    // Se envían eventos comprobables antes de que Gemini emita su primer
    // resumen. Gemini puede publicar sus thought summaries solo al terminar.
    reply.raw.flushHeaders?.();
    const send = (event: 'phase' | 'thought' | 'heartbeat' | 'complete' | 'error', value: unknown) => {
      if (reply.raw.destroyed || reply.raw.writableEnded) return;
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
    };
    const startedAt = Date.now();
    const heartbeat = setInterval(() => send('heartbeat', {
      phase: 'analysis', at: new Date().toISOString(),
      elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
    }), 15_000);
    heartbeat.unref?.();
    try {
      send('phase', { phase: 'reading', text: 'Consultando los documentos autorizados de Google Drive.', at: new Date().toISOString() });
      const analysis = await this.analyzePoc.execute(input, sourceReader, (text) => {
        if (text.trim()) send('thought', { text });
      }, (phase, text) => send('phase', { phase, text, at: new Date().toISOString() }));
      send('complete', analysis);
    } catch (reason) {
      send('error', { message: reason instanceof HttpException
        ? reason.message : 'No se pudo completar el análisis documental.' });
    } finally {
      clearInterval(heartbeat);
      if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.end();
    }
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
