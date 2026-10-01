import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Query } from '@nestjs/common';
import {
  listSupportBillingRowsQuerySchema,
  markSupportInvoicePaidSchema,
  supportBillingOverviewQuerySchema,
  type BillingLedgerResponse,
  type ListSupportBillingRowsQuery,
  type ListSupportBillingRowsResponse,
  type MarkSupportInvoicePaidInput,
  type SupportBillingOverview,
  type SupportBillingOverviewQuery,
} from '@kora/contracts';
import { RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { CurrentUser, type RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import type { ActorContext } from '../../../shared/application/use-case';
import { MarkSupportInvoicePaidUseCase } from '../application/use-cases/mark-support-invoice-paid.use-case';
import { GetSupportBillingOverviewUseCase } from '../application/use-cases/get-support-billing-overview.use-case';
import { ListBillingLedgerEntriesUseCase } from '../application/use-cases/list-billing-ledger-entries.use-case';
import { ListSupportBillingRowsUseCase } from '../application/use-cases/list-support-billing-rows.use-case';

@Controller('support-invoices')
export class SupportInvoicesController {
  constructor(
    private readonly markPaid: MarkSupportInvoicePaidUseCase,
    private readonly getOverview: GetSupportBillingOverviewUseCase,
    private readonly getLedger: ListBillingLedgerEntriesUseCase,
    private readonly listRows: ListSupportBillingRowsUseCase,
  ) {}

  /** Panel de Facturación de Soporte — declarado ANTES de `:id/paid` no aplica aquí (`overview` no colisiona con `:id`), pero se mantiene el mismo orden defensivo que en `SupportPlansController`. */
  @Get('overview')
  @RequirePermissions('billing:read')
  async overview(
    @Query(new ZodValidationPipe(supportBillingOverviewQuerySchema)) query: SupportBillingOverviewQuery,
  ): Promise<SupportBillingOverview> {
    return unwrapOrThrow(await this.getOverview.execute({ period: query.period }));
  }

  /** Tabla del panel — paginada, filtrada y ordenada en el servidor; los KPIs van aparte (`overview`). */
  @Get('overview/rows')
  @RequirePermissions('billing:read')
  async overviewRows(
    @Query(new ZodValidationPipe(listSupportBillingRowsQuerySchema)) query: ListSupportBillingRowsQuery,
  ): Promise<ListSupportBillingRowsResponse> {
    const page = unwrapOrThrow(await this.listRows.execute(query));
    return { ...page, items: [...page.items] };
  }

  /** Libro combinado de Facturación (rol Finanzas) — Soporte + Proyectos en una sola tabla. */
  @Get('billing-ledger')
  @RequirePermissions('billing:read')
  async billingLedger(): Promise<BillingLedgerResponse> {
    return unwrapOrThrow(await this.getLedger.execute());
  }

  @Patch(':id/paid')
  @RequirePermissions('billing:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAsPaid(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(markSupportInvoicePaidSchema)) body: MarkSupportInvoicePaidInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(await this.markPaid.execute({ invoiceId: id, data: body, actor: toActorContext(actor) }));
  }
}

function toActorContext(user: RequestUser): ActorContext {
  return { userId: user.id, email: user.email };
}
