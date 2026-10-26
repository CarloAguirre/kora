import type { SupportPlanStatus } from '@kora/contracts';

/** El estado del proyecto de soporte depende de sus contratos directos. */
export interface SupportContractStatusReader {
  statusesForProject(projectId: string): Promise<readonly SupportPlanStatus[]>;
}

export const SUPPORT_CONTRACT_STATUS_READER = Symbol('SupportContractStatusReader');
