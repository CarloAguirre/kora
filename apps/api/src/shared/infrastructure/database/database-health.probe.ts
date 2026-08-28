import { Inject, Injectable } from '@nestjs/common';
import { sql, type Database } from '@kora/db';
import type { HealthProbe } from '../../application/ports/health-probe.port';
import { DATABASE } from './database.module';

/**
 * Comprueba que Postgres responde.
 *
 * Una consulta trivial basta: interesa saber si la conexión está viva y el pool
 * puede entregar una, no medir rendimiento.
 */
@Injectable()
export class DatabaseHealthProbe implements HealthProbe {
  readonly name = 'database';

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async check(): Promise<boolean> {
    try {
      await this.db.execute(sql`select 1`);
      return true;
    } catch {
      return false;
    }
  }
}
