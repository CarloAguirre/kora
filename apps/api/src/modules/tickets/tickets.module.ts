import { Module } from '@nestjs/common';
import { TicketsController } from './presentation/tickets.controller';
import { SupportPlansController } from './presentation/support-plans.controller';
import { SupportInvoicesController } from './presentation/support-invoices.controller';

import { CreateTicketUseCase } from './application/use-cases/create-ticket.use-case';
import { UpdateTicketUseCase } from './application/use-cases/update-ticket.use-case';
import { ListTicketsUseCase } from './application/use-cases/list-tickets.use-case';
import { GetTicketUseCase } from './application/use-cases/get-ticket.use-case';
import { ChangeTicketStatusUseCase } from './application/use-cases/change-ticket-status.use-case';
import { DeleteTicketUseCase } from './application/use-cases/delete-ticket.use-case';
import { CreateTicketHhRequestUseCase } from './application/use-cases/create-ticket-hh-request.use-case';
import { ListTicketHhRequestsUseCase } from './application/use-cases/list-ticket-hh-requests.use-case';
import { ApproveTicketHhRequestUseCase } from './application/use-cases/approve-ticket-hh-request.use-case';
import { RejectTicketHhRequestUseCase } from './application/use-cases/reject-ticket-hh-request.use-case';
import { GetSupportPlanSummaryUseCase } from './application/use-cases/get-support-plan-summary.use-case';
import { ListLinkableTicketProjectsUseCase } from './application/use-cases/list-linkable-ticket-projects.use-case';
import { ListLinkableTicketClientsUseCase } from './application/use-cases/list-linkable-ticket-clients.use-case';
import { CreateSupportPlanUseCase } from './application/use-cases/create-support-plan.use-case';
import { UpdateSupportPlanUseCase } from './application/use-cases/update-support-plan.use-case';
import { CloseSupportPlanUseCase } from './application/use-cases/close-support-plan.use-case';
import { GetSupportPlanUseCase } from './application/use-cases/get-support-plan.use-case';
import { ListSupportPlansForClientUseCase } from './application/use-cases/list-support-plans-for-client.use-case';
import { MarkSupportInvoiceIssuedUseCase } from './application/use-cases/mark-support-invoice-issued.use-case';
import { MarkSupportInvoicePaidUseCase } from './application/use-cases/mark-support-invoice-paid.use-case';
import { GetSupportBillingOverviewUseCase } from './application/use-cases/get-support-billing-overview.use-case';
import { ListBillingLedgerEntriesUseCase } from './application/use-cases/list-billing-ledger-entries.use-case';
import { ListSupportBillingRowsUseCase } from './application/use-cases/list-support-billing-rows.use-case';
import { SupportBillingRowBuilder } from './application/services/support-billing-row-builder';
import { CreateSupportProjectUseCase } from './application/use-cases/create-support-project.use-case';
import { SupportPlanAvailabilityService } from './application/services/support-plan-availability.service';
import { SupportBillingCalculator } from './application/services/support-billing-calculator';
import { SupportPlanCurrentBillingResolver } from './application/services/support-plan-current-billing.resolver';
import { SupportPlanSummaryBuilder } from './application/services/support-plan-summary-builder';
import { SupportMonthlyPeriodReconciler } from './application/services/support-monthly-period-reconciler';

import { TICKET_REPOSITORY } from './domain/repositories/ticket.repository';
import { TICKET_HISTORY_REPOSITORY } from './domain/repositories/ticket-history.repository';
import { TICKET_HH_REQUEST_REPOSITORY } from './domain/repositories/ticket-hh-request.repository';
import { SUPPORT_PLAN_REPOSITORY } from './domain/repositories/support-plan.repository';
import { SUPPORT_INVOICE_REPOSITORY } from './domain/repositories/support-invoice.repository';
import { TICKET_USER_READER } from './application/ports/ticket-user-reader.port';
import { TICKET_CLIENT_READER } from './application/ports/ticket-client-reader.port';
import { TICKET_PROJECT_READER } from './application/ports/ticket-project-reader.port';
import { TICKET_CODE_GENERATOR } from './application/ports/ticket-code-generator.port';

import { DrizzleTicketRepository } from './infrastructure/persistence/drizzle-ticket.repository';
import { DrizzleTicketHistoryRepository } from './infrastructure/persistence/drizzle-ticket-history.repository';
import { DrizzleTicketHhRequestRepository } from './infrastructure/persistence/drizzle-ticket-hh-request.repository';
import { DrizzleSupportPlanRepository } from './infrastructure/persistence/drizzle-support-plan.repository';
import { DrizzleSupportInvoiceRepository } from './infrastructure/persistence/drizzle-support-invoice.repository';
import { UsersModuleTicketUserReader } from './infrastructure/services/users-module-ticket-user-reader';
import { ClientsModuleTicketClientReader } from './infrastructure/services/clients-module-ticket-client-reader';
import { ProjectsModuleTicketProjectReader } from './infrastructure/services/projects-module-ticket-project-reader';
import { DrizzleTicketCodeGenerator } from './infrastructure/services/drizzle-ticket-code-generator';

import { UsersModule } from '../users/users.module';
import { ClientsModule } from '../clients/clients.module';
import { ProjectsModule } from '../projects/projects.module';
import { HoursModule } from '../hours/hours.module';

/**
 * Composición de M5 (Tickets + gate de plan de soporte + solicitud de HH
 * desde ticket + contratos de soporte y su facturación). Ver
 * docs/DECISION-M5-TICKETS.md para lo que sigue fuera de alcance (libro de
 * movimientos de saldo, Kanban, importador Excel). El dominio de soporte se
 * queda DENTRO de este módulo — no se separa uno nuevo — porque tickets y
 * soporte no se pueden separar limpiamente (el gate de creación de tickets
 * depende del motor financiero de soporte). Importa `HoursModule` por
 * `HOUR_ENTRY_REPOSITORY` — lo usan tanto la solicitud de HH de un ticket
 * como el cálculo de facturación de soporte.
 */
@Module({
  imports: [UsersModule, ClientsModule, ProjectsModule, HoursModule],
  controllers: [TicketsController, SupportPlansController, SupportInvoicesController],
  providers: [
    CreateTicketUseCase,
    UpdateTicketUseCase,
    ListTicketsUseCase,
    GetTicketUseCase,
    ChangeTicketStatusUseCase,
    DeleteTicketUseCase,
    CreateTicketHhRequestUseCase,
    ListTicketHhRequestsUseCase,
    ApproveTicketHhRequestUseCase,
    RejectTicketHhRequestUseCase,
    GetSupportPlanSummaryUseCase,
    ListLinkableTicketProjectsUseCase,
    ListLinkableTicketClientsUseCase,
    CreateSupportPlanUseCase,
    UpdateSupportPlanUseCase,
    CloseSupportPlanUseCase,
    GetSupportPlanUseCase,
    ListSupportPlansForClientUseCase,
    MarkSupportInvoiceIssuedUseCase,
    MarkSupportInvoicePaidUseCase,
    GetSupportBillingOverviewUseCase,
    ListBillingLedgerEntriesUseCase,
    ListSupportBillingRowsUseCase,
    CreateSupportProjectUseCase,
    SupportPlanAvailabilityService,
    SupportBillingCalculator,
    SupportPlanCurrentBillingResolver,
    SupportPlanSummaryBuilder,
    SupportBillingRowBuilder,
    SupportMonthlyPeriodReconciler,

    { provide: TICKET_REPOSITORY, useClass: DrizzleTicketRepository },
    { provide: TICKET_HISTORY_REPOSITORY, useClass: DrizzleTicketHistoryRepository },
    { provide: TICKET_HH_REQUEST_REPOSITORY, useClass: DrizzleTicketHhRequestRepository },
    { provide: SUPPORT_PLAN_REPOSITORY, useClass: DrizzleSupportPlanRepository },
    { provide: SUPPORT_INVOICE_REPOSITORY, useClass: DrizzleSupportInvoiceRepository },
    { provide: TICKET_USER_READER, useClass: UsersModuleTicketUserReader },
    { provide: TICKET_CLIENT_READER, useClass: ClientsModuleTicketClientReader },
    { provide: TICKET_PROJECT_READER, useClass: ProjectsModuleTicketProjectReader },
    { provide: TICKET_CODE_GENERATOR, useClass: DrizzleTicketCodeGenerator },
  ],
  exports: [TICKET_REPOSITORY],
})
export class TicketsModule {}
