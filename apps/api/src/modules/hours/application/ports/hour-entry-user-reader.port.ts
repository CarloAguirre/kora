import type { RoleCode, UserStatus } from '@kora/contracts';

export interface HourEntryUserReference {
  readonly id: string;
  readonly fullName: string;
  readonly role: RoleCode;
  readonly status: UserStatus;
}

export interface HourEntryUserReader {
  findById(userId: string): Promise<HourEntryUserReference | null>;
  findManyByIds(userIds: readonly string[]): Promise<HourEntryUserReference[]>;
}

export const HOUR_ENTRY_USER_READER = Symbol('HourEntryUserReader');
