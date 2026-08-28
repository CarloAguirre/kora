import { Inject, Injectable } from '@nestjs/common';
import { sql, type Database } from '@kora/db';
import type { TicketCodeGenerator } from '../../application/ports/ticket-code-generator.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';

@Injectable()
export class DrizzleTicketCodeGenerator implements TicketCodeGenerator {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async next(): Promise<string> {
    const rows = await this.database.execute<{ value: number }>(sql`select nextval('tickets_code_seq') as value`);
    const value = Number(rows[0]?.value);
    return `TK-${String(value).padStart(4, '0')}`;
  }
}
