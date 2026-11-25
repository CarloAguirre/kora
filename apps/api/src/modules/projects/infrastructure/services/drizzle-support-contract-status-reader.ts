import { Inject, Injectable } from '@nestjs/common';
import { eq, supportPlans, type Database } from '@kora/db';
import type { SupportPlanStatus } from '@kora/contracts';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import type { SupportContractStatusReader } from '../../application/ports/support-contract-status-reader.port';

@Injectable()
export class DrizzleSupportContractStatusReader implements SupportContractStatusReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async statusesForProject(projectId: string): Promise<readonly SupportPlanStatus[]> {
    const plans = await this.database
      .select({ status: supportPlans.status })
      .from(supportPlans)
      .where(eq(supportPlans.projectId, projectId));
    return plans.map((plan) => plan.status);
  }
}
