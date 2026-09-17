import { Inject, Injectable } from '@nestjs/common';
import { eq, projectBillingSettings, type Database } from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  ProjectBillingSettingsRecord,
  ProjectBillingSettingsRepository,
} from '../../domain/repositories/project-billing-settings.repository';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

const SINGLETON_ID = 'singleton';

@Injectable()
export class DrizzleProjectBillingSettingsRepository implements ProjectBillingSettingsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async get(context?: TransactionContext): Promise<ProjectBillingSettingsRecord> {
    const db = resolveDb(this.database, context);

    const rows = await db
      .select({
        autoActivateFirstPayment: projectBillingSettings.autoActivateFirstPayment,
        updatedAt: projectBillingSettings.updatedAt,
      })
      .from(projectBillingSettings)
      .where(eq(projectBillingSettings.id, SINGLETON_ID))
      .limit(1);

    const row = rows[0];
    if (row) return row;

    // Sin fila sembrada todavía — el valor por defecto de la columna es `true`.
    return { autoActivateFirstPayment: true, updatedAt: null };
  }

  async update(
    autoActivateFirstPayment: boolean,
    updatedByUserId: string,
    now: Date,
    context?: TransactionContext,
  ): Promise<void> {
    const db = resolveDb(this.database, context);

    await db
      .insert(projectBillingSettings)
      .values({ id: SINGLETON_ID, autoActivateFirstPayment, updatedByUserId, updatedAt: now })
      .onConflictDoUpdate({
        target: projectBillingSettings.id,
        set: { autoActivateFirstPayment, updatedByUserId, updatedAt: now },
      });
  }
}
