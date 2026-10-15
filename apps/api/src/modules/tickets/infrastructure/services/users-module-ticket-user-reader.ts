import { Inject, Injectable } from '@nestjs/common';
import { USER_REPOSITORY, type UserRepository } from '../../../users/domain/repositories/user.repository';
import type { TicketUserReader, TicketUserReference } from '../../application/ports/ticket-user-reader.port';

@Injectable()
export class UsersModuleTicketUserReader implements TicketUserReader {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async findById(userId: string): Promise<TicketUserReference | null> {
    const user = await this.users.findById(userId);
    if (!user || user.isDeleted) return null;
    return { id: user.id, fullName: user.name.fullName, status: user.status, role: user.role };
  }
}
