import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import type { CloseSupportInvoicePeriodInput } from '@kora/contracts';
import { SupportInvoicePeriodNotPendingError, SupportPlanNotFoundError } from '../../domain/errors/support-plan.errors';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import { SUPPORT_INVOICE_REPOSITORY, type SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import { periodBillingOf } from '../services/support-invoice-payment-status';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface CloseSupportInvoicePeriodCommand {
  readonly planId: string;
  readonly data: CloseSupportInvoicePeriodInput;
  readonly actor: ActorContext;
}

/**
 * "Cerrar mes por lo facturado": un período "facturado parcial" deja de tener
 * saldo por facturar — queda facturado por la suma de sus facturas y la
 * diferencia no se cobra (mismo efecto que registrar con `closePeriod`).
 */
@Injectable()
export class CloseSupportInvoicePeriodUseCase implements UseCase<CloseSupportInvoicePeriodCommand, void, ApplicationError> {
  constructor(
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    @Inject(SUPPORT_INVOICE_REPOSITORY) private readonly invoices: SupportInvoiceRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(command: CloseSupportInvoicePeriodCommand): Promise<Result<void, ApplicationError>> {
    const { planId, data, actor } = command;

    const plan = await this.plans.findById(planId);
    if (!plan) return err(new SupportPlanNotFoundError(planId));

    const invoices = await this.invoices.listByPlanAndPeriod(planId, data.periodKey);
    const billing = periodBillingOf(invoices);
    if (!billing || billing.status !== 'partially_invoiced') return err(new SupportInvoicePeriodNotPendingError(data.periodKey));

    await this.invoices.setPeriodTarget(planId, data.periodKey, null);

    for (const invoice of invoices) {
      await this.audit.record({
        actor: { userId: actor.userId, email: actor.email },
        action: 'update',
        entityType: 'support_invoice',
        entityId: invoice.id,
        metadata: {
          planId,
          periodKey: data.periodKey,
          closedPeriod: true,
          totalAmountUf: billing.totalAmountUf,
          invoicedAmountUf: billing.invoicedAmountUf,
          waivedAmountUf: billing.pendingAmountUf,
        },
      });
    }

    return ok(undefined);
  }
}
