import type { TransactionContext } from '@kora/core';

/** Interruptor global de Hito 0 — fila única (`project_billing_settings`). */
export interface ProjectBillingSettingsRecord {
  readonly autoActivateFirstPayment: boolean;
  readonly updatedAt: Date | null;
}

export interface ProjectBillingSettingsRepository {
  get(context?: TransactionContext): Promise<ProjectBillingSettingsRecord>;
  update(
    autoActivateFirstPayment: boolean,
    updatedByUserId: string,
    now: Date,
    context?: TransactionContext,
  ): Promise<void>;
}

export const PROJECT_BILLING_SETTINGS_REPOSITORY = Symbol('ProjectBillingSettingsRepository');
