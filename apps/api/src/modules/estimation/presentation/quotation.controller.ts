import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, HttpException, Inject, Logger, Optional, Param, ParseUUIDPipe, ParseIntPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type { FastifyReply } from 'fastify';
import {
  applyQuotationPlanningSchema, generateAiDemoQuotationSchema, createQuotationVersionSchema, updateQuotationDraftSchema, quotationReconciliationReviewSchema, assessQuotationReconciliationSchema,
  quotationRevisionActionSchema, approveClientQuotationSchema, transferApprovedQuotationSchema,
  type QuotationRevisionActionInput, type ApproveClientQuotationInput, type TransferApprovedQuotationInput, type QuotationTransferResult,
  type ApplyQuotationPlanningInput, type AppliedQuotationPlanning, type GenerateAiDemoQuotationInput, type QuotationTeamCatalogEntry, type CreateQuotationVersionInput, type ProjectQuotation, type QuotationVersion, type UpdateQuotationDraftInput, type QuotationTransferPreview, type QuotationCommercialPreflight, type QuotationCommercialDossier, type QuotationReconciliationReview, type SavedQuotationReconciliationReview, type AssessQuotationReconciliationInput, type SavedQuotationReviewAssessment,
} from '@kora/contracts';
import { CurrentUser, type RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import { RequireAnyPermission } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { ManageQuotationDraftsUseCase } from '../application/use-cases/manage-quotation-drafts.use-case';
import { GenerateEstimationPocProposalUseCase } from '../application/use-cases/generate-estimation-poc-proposal.use-case';
import { GetEstimationQuestionnaireDefinitionUseCase } from '../application/use-cases/get-estimation-questionnaire-definition.use-case';
import { validateQuestionnaireAnswers } from '../application/validate-estimation-questionnaire';
import { AppConfigService } from '../../../config/app-config.service';
import { GoogleDriveOAuthPocService } from '../../../shared/infrastructure/auth/google-drive-oauth-poc.service';
import { extractDriveFolderId } from '../application/drive-source-selection';
import { isCompatibleTechLeadTeam } from '../application/estimation-methodology';
import { resolveAuthorizedDriveReader } from '../infrastructure/drive/resolve-authorized-drive-reader';

/**
 * API comercial separada de /poc/*. Además de borradores y actas,
 * permite aplicar SOLO el baseline técnico inicial al Roadmap de un prospecto
 * vacío; envío/aprobación contractual, facturación y recotización histórica
 * permanecen sin implementar.
 */
@Controller('estimations/projects/:projectId/quotation')
export class QuotationController {
  private readonly logger = new Logger(QuotationController.name);

  constructor(
    private readonly drafts: ManageQuotationDraftsUseCase,
    private readonly generator: GenerateEstimationPocProposalUseCase,
    private readonly questionnaire: GetEstimationQuestionnaireDefinitionUseCase,
    @Optional() @Inject(AppConfigService) private readonly config?: AppConfigService,
    @Optional() @Inject(GoogleDriveOAuthPocService) private readonly driveOAuthPoc?: GoogleDriveOAuthPocService,
  ) {}

  @Get()
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  get(@Param('projectId', ParseUUIDPipe) projectId: string, @CurrentUser() actor: RequestUser): Promise<ProjectQuotation | null> {
    return this.drafts.get(projectId, actor);
  }

  /** Catálogo real activo leído con permiso del proyecto, sin exigir teams:read. */
  @Get('active-teams')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  listActiveTeams(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<QuotationTeamCatalogEntry[]> {
    return this.drafts.listActiveQuotationTeams(projectId, actor);
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
    if (input.projectId !== projectId) throw new BadRequestException('El proyecto no coincide.');
    await this.drafts.authorizeAiPoc(projectId, actor);
    return this.createAuthorizedAiPoc(projectId, input, actor);
  }

  /**
   * El stream usa el mismo flujo de generación/validación de la ruta REST.
   * La propuesta y EDT cuestan llamadas IA; guardar solo ocurre al final.
   * Los fallos tienen fase e ID de diagnóstico para no repetir generación
   * a ciegas, y los detalles internos se registran exclusivamente en servidor.
   */
  @Post('versions/ai-poc/stream')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  async createAiPocStream(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(generateAiDemoQuotationSchema)) input: GenerateAiDemoQuotationInput,
    @CurrentUser() actor: RequestUser,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (input.projectId !== projectId) throw new BadRequestException('El proyecto no coincide.');
    await this.drafts.authorizeAiPoc(projectId, actor);
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    });
    const progress: { phase: 'preflight' | 'proposal' | 'edt' | 'saving' } = { phase: 'preflight' };
    const send = (event: 'thought' | 'phase' | 'activity' | 'heartbeat' | 'complete' | 'error', data: unknown) => {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };
    const startedAt = Date.now();
    const activity = (step: string, text: string) =>
      send('activity', { step, text, at: new Date().toISOString() });
    activity('request_authorized', 'Acceso verificado. Preparando la solicitud de cotización.');
    // Solo confirma que la conexión al servidor sigue activa; no representa
    // avances internos ficticios del modelo ni consume tokens.
    const heartbeat = setInterval(() => {
      send('heartbeat', {
        phase: progress.phase, at: new Date().toISOString(),
        elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
      });
    }, 15_000);
    heartbeat.unref?.();
    try {
      const result = await this.createAuthorizedAiPoc(
        projectId, input, actor, (text) => {
          if (text.trim()) send('thought', { text });
        }, (phase) => {
          progress.phase = phase;
          send('phase', { phase });
        }, activity,
      );
      send('complete', result);
    } catch (reason) {
      const diagnosticId = randomUUID().slice(0, 8);
      // Nunca registrar el body, PDF, texto documental ni credenciales.
      // En Zod reportar solo rutas/códigos; en PostgreSQL solo código/tabla/
      // restricción. Los mensajes del proveedor pueden incluir datos privados.
      const kind = reason instanceof Error ? reason.name : typeof reason;
      const metadata = reason && typeof reason === 'object'
        ? reason as { code?: unknown; constraint?: unknown; table?: unknown; column?: unknown }
        : {};
      const safe = (value: unknown) =>
        typeof value === 'string' ? value.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 100) : undefined;
      const issues = reason instanceof ZodError
        ? reason.issues.slice(0, 12).map((issue) => ({
          path: issue.path.map(String).join('.'),
          code: issue.code,
        })) : undefined;
      // Solo marcos del código (archivo/línea), nunca la primera línea del
      // stack, que incluye mensajes del proveedor o posibles datos privados.
      const frames = reason instanceof Error && typeof reason.stack === 'string'
        ? reason.stack.split('\n').slice(1, 6)
          .map((line) => line.trim())
          .filter((line) => /^at\s/.test(line))
          .map((line) => line.slice(0, 350))
        : undefined;
      this.logger.error(JSON.stringify({
        event: 'quotation_ai_generation_failed',
        diagnosticId, projectId, phase: progress.phase, kind,
        code: safe(metadata.code), constraint: safe(metadata.constraint),
        table: safe(metadata.table), column: safe(metadata.column), issues, frames,
      }));
      const phaseLabel = progress.phase === 'saving'
        ? 'guardado de cotización'
        : progress.phase === 'edt' ? 'generación o validación de EDT'
          : progress.phase === 'proposal' ? 'propuesta de perfiles'
            : 'validación inicial';
      const message = reason instanceof HttpException
        ? reason.message
        : 'Kora no pudo completar la etapa de ' + phaseLabel +
          '. Código de diagnóstico: ' + diagnosticId +
          '. No repitas la generación todavía: revisa el estado de las cotizaciones y el log del servidor.';
      send('error', { message, phase: progress.phase, diagnosticId });
    } finally {
      clearInterval(heartbeat);
      if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.end();
    }
  }

  private async createAuthorizedAiPoc(
    projectId: string,
    input: GenerateAiDemoQuotationInput,
    actor: RequestUser,
    onThoughtSummary?: (text: string) => void,
    onPhase?: (phase: 'proposal' | 'edt' | 'saving') => void,
    onActivity?: (step: string, text: string) => void,
  ): Promise<QuotationVersion> {
    const isDemo = extractDriveFolderId(input.driveFolderUrl) === 'kora-poc-fallback';
    if (isDemo && input.driveFolderUrl !== 'https://drive.google.com/drive/folders/kora-poc-fallback') {
      throw new BadRequestException('URL de demostración no autorizada.');
    }
    const sourceReader = isDemo ? undefined : resolveAuthorizedDriveReader(
      input.driveFolderUrl, actor.id, this.config, this.driveOAuthPoc,
    );
    if (input.dynamicQuestions.some((question) =>
      question.kind !== 'dynamic' || question.sourceRefs.length === 0 ||
      (isDemo && question.sourceRefs.some((ref) => ref.sourceId !== 'kora-poc-requerimiento-kdm'))
    )) {
      throw new BadRequestException('Las preguntas dinámicas deben citar la fuente documental seleccionada.');
    }
    if (!isDemo && sourceReader && input.dynamicQuestions.length) {
      onActivity?.('verify_sources', 'Comprobando referencias a documentos autorizados.');
      const validIds = new Set((await sourceReader.readDriveSources(input.driveFolderUrl)).map((doc) => doc.sourceId));
      if (input.dynamicQuestions.some((question) => question.sourceRefs.some((ref) => !validIds.has(ref.sourceId)))) {
        throw new BadRequestException('Las preguntas recibidas citan documentos ajenos a la carpeta de Drive.');
      }
    }
    validateQuestionnaireAnswers(
      this.questionnaire.execute(), input.answers, input.dynamicQuestions,
    );
    onActivity?.('questionnaire_verified', 'Respuestas y aclaraciones del cuestionario validadas.');
    // Usar el catálogo real activo, leído en backend tras comprobar permisos.
    // Ninguna identidad de equipo proviene de un nombre libre de Gemini.
    onActivity?.('teams_query', 'Consultando los equipos activos del proyecto.');
    const activeTeams = await this.drafts.listActiveQuotationTeams(projectId, actor);
    if (!activeTeams.length) {
      throw new BadRequestException('No existen equipos activos en Kora para generar la cotización.');
    }
    const f03 = input.answers.find((answer) => answer.questionId === 'F03')?.value;
    const specific = f03 === 'specific_profiles';
    const chosenTeamIds = input.selectedTeamIds ?? [];
    if (!specific && chosenTeamIds.length) {
      throw new BadRequestException('Los equipos específicos solo se permiten si F03=Perfiles específicos.');
    }
    if (specific && !chosenTeamIds.length) {
      throw new BadRequestException('Selecciona al menos un equipo activo para F03.');
    }
    const selectedIds = new Set(chosenTeamIds);
    const missingTeam = chosenTeamIds.find((id) =>
      !activeTeams.some((team) => team.teamId === id));
    if (missingTeam) {
      throw new BadRequestException('Se seleccionó un equipo inexistente o inactivo: ' + missingTeam);
    }
    const allowedTeams = specific
      ? activeTeams.filter((team) => selectedIds.has(team.teamId))
      : activeTeams;
    if (specific && !allowedTeams.some((team) => isCompatibleTechLeadTeam(team.name))) {
      throw new BadRequestException(
        'Incluye un equipo de desarrollo o arquitectura para la supervisión obligatoria del Líder Técnico.',
      );
    }
    onActivity?.('teams_verified', 'Equipos permitidos para esta estimación: ' + allowedTeams.length + '.');
    onPhase?.('proposal');
    const proposal = onThoughtSummary
      ? await this.generator.execute(input, allowedTeams, sourceReader, onThoughtSummary, onActivity)
      : await this.generator.execute(input, allowedTeams, sourceReader);
    if (!['gemini', 'openai'].includes(proposal.provider) ||
        proposal.sourceMode !== (isDemo ? 'poc_simulated' : 'drive') ||
        proposal.documentsAnalyzed < 1) {
      throw new BadRequestException('La propuesta IA no tiene evidencia documental válida.');
    }
    const validIds = new Set(allowedTeams.map((team) => team.teamId));
    if (proposal.roles.some((role) => !role.teamId || !validIds.has(role.teamId))) {
      throw new BadRequestException('El proveedor IA propuso un perfil sin equipo activo de Kora.');
    }
    onPhase?.('edt');
    const edt = onThoughtSummary
      ? await this.generator.generateEdt(input, proposal, allowedTeams, sourceReader, onThoughtSummary, onActivity)
      : await this.generator.generateEdt(input, proposal, allowedTeams, sourceReader);
    // La EDT detallada determina las HH finales; la primera llamada propone
    // perfiles/capacidad, pero no impone un presupuesto a las actividades.
    onActivity?.('reconciling', 'Conciliando perfiles y horas contra la EDT validada.');
    const reconciled = this.generator.reconcileProposalWithEdt(proposal, edt);
    if (reconciled.roles.some((role) => !role.teamId || !validIds.has(role.teamId))) {
      throw new BadRequestException('La propuesta IA no asignó todos los perfiles a equipos activos de Kora.');
    }
    const roleTeamIds = Object.fromEntries(
      reconciled.roles.map((role) => [role.role, role.teamId!]),
    );
    onActivity?.('reconciled', 'Conciliación de perfiles y HH completada.');
    onPhase?.('saving');
    onActivity?.('saving', 'Guardando la cotización comercial como borrador.');
    const saved = await this.drafts.createAiPocDraft(
      projectId, actor, reconciled, input.answers, input.dynamicQuestions, edt,
      input.confirmedUnderstanding, roleTeamIds, chosenTeamIds,
    );
    onActivity?.('saved', 'Cotización guardada correctamente.');
    return saved;
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
