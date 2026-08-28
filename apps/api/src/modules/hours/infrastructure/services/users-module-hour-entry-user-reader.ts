import { Inject, Injectable } from '@nestjs/common';
import { USER_REPOSITORY, type UserRepository } from '../../../users/domain/repositories/user.repository';
import type { HourEntryUserReader, HourEntryUserReference } from '../../application/ports/hour-entry-user-reader.port';

@Injectable()
export class UsersModuleHourEntryUserReader implements HourEntryUserReader {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async findById(userId: string): Promise<HourEntryUserReference | null> {
    const user = await this.users.findById(userId);
    if (!user || user.isDeleted) return null;
    return { id: user.id, fullName: user.name.fullName, role: user.role, status: user.status };
  }

  async findManyByIds(userIds: readonly string[]): Promise<HourEntryUserReference[]> {
    const results = await Promise.all(userIds.map((id) => this.findById(id)));
    return results.filter((user): user is HourEntryUserReference => user !== null);
  }
}
