import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import {
  closeSupportPlanSchema,
  createProjectSchema,
  createSupportPlanSchema,
  markSupportInvoiceIssuedSchema,
  updateSupportPlanSchema,
  type CloseSupportPlanInput,
  type CreateProjectInput,
  type CreateSupportPlanInput,
  type MarkSupportInvoiceIssuedInput,
  type SupportPlanListItem,
  type SupportPlanWithInvoices,
  type SupportProjectDetailSummary,
  type UpdateSupportPlanInput,
} from '@kora/contracts';
import { RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { CurrentUser, type RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import type { ActorContext } from '../../../shared/application/use-case';
import { GetSupportPlanSummaryUseCase } from '../application/use-cases/get-support-plan-summary.use-case';
import { CreateSupportPlanUseCase } from '../application/use-cases/create-support-plan.use-case';
import { CreateSupportProjectUseCase } from '../application/use-cases/create-support-project.use-case';
import { UpdateSupportPlanUseCase } from '../application/use-cases/update-support-plan.use-case';
import { CloseSupportPlanUseCase } from '../application/use-cases/close-support-plan.use-case';
import { GetSupportPlanUseCase } from '../application/use-cases/get-support-plan.use-case';
import { ListSupportPlansForClientUseCase } from '../application/use-cases/list-support-plans-for-client.use-case';
import { MarkSupportInvoiceIssuedUseCase } from '../application/use-cases/mark-support-invoice-issued.use-case';

@Controller('support-plans')
export class SupportPlansController {
  constructor(
    private readonly getSummary: GetSupportPlanSummaryUseCase,
    private readonly createPlan: CreateSupportPlanUseCase,
    private readonly updatePlan: UpdateSupportPlanUseCase,
    private readonly closePlan: CloseSupportPlanUseCase,
    private readonly getPlan: GetSupportPlanUseCase,
    private readonly listForClient: ListSupportPlansForClientUseCase,
    private readonly markInvoiceIssued: MarkSupportInvoiceIssuedUseCase,
    private readonly createProjectWithPlan: CreateSupportProjectUseCase,
  ) {}

  @Get('project/:projectId')
  @RequirePermissions('projects:read')
  async summaryForProject(@Param('projectId') projectId: string): Promise<SupportProjectDetailSummary | null> {
    return unwrapOrThrow(await this.getSummary.execute({ projectId }));
  }

  /** Alimenta la tabla "Contratos" de la ficha de cliente — declarada ANTES de `:id` para no chocar con esa ruta. */
  @Get('client/:clientId')
  @RequirePermissions('projects:read')
  async listByClient(@Param('clientId') clientId: string): Promise<SupportPlanListItem[]> {
    return unwrapOrThrow(await this.listForClient.execute({ clientId }));
  }

  @Post()
  @RequirePermissions('projects:manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createSupportPlanSchema)) body: CreateSupportPlanInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ id: string }> {
    return unwrapOrThrow(await this.createPlan.execute({ data: body, actor: toActorContext(actor) }));
  }

  /**
   * Crea un proyecto de soporte junto con su contrato (mismo enlace directo
   * que usan los 30 contratos legados) — para un cliente que contrata soporte
   * sin un proyecto de desarrollo terminado previo que consolidar. Distinto
   * de `POST /support-plans`, que vincula proyectos YA existentes.
   * Declarada ANTES de `:id` para no chocar con esa ruta.
   */
  @Post('with-project')
  @RequirePermissions('projects:manage')
  @HttpCode(HttpStatus.CREATED)
  async createWithProject(
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ id: string }> {
    return unwrapOrThrow(await this.createProjectWithPlan.execute({ data: body, actor: toActorContext(actor) }));
  }

  @Get(':id')
  @RequirePermissions('projects:read')
  async detail(@Param('id') id: string): Promise<SupportPlanWithInvoices> {
    return unwrapOrThrow(await this.getPlan.execute({ planId: id }));
  }

  @Patch(':id')
  @RequirePermissions('projects:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSupportPlanSchema)) body: UpdateSupportPlanInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(await this.updatePlan.execute({ planId: id, data: body, actor: toActorContext(actor) }));
  }

  @Patch(':id/close')
  @RequirePermissions('projects:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async close(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(closeSupportPlanSchema)) body: CloseSupportPlanInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(await this.closePlan.execute({ planId: id, data: body, actor: toActorContext(actor) }));
  }

  @Post(':id/invoices')
  @RequirePermissions('billing:manage')
  @HttpCode(HttpStatus.CREATED)
  async issueInvoice(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(markSupportInvoiceIssuedSchema)) body: MarkSupportInvoiceIssuedInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ id: string }> {
    return unwrapOrThrow(await this.markInvoiceIssued.execute({ planId: id, data: body, actor: toActorContext(actor) }));
  }
}

function toActorContext(user: RequestUser): ActorContext {
  return { userId: user.id, email: user.email };
}
