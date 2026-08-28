import { Inject, Injectable } from '@nestjs/common';
import { eq, roles, type Database } from '@kora/db';
import { InfrastructureError } from '@kora/core';
import type { RoleCode } from '@kora/contracts';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';

/**
 * Traduce el código de rol del dominio al identificador de la fila.
 *
 * El dominio trabaja con códigos (`'admin'`, `'leader'`), que son estables y
 * legibles; la base usa UUIDs, que son estables frente a renombrados. Este
 * catálogo es el puente, y cachea el mapeo porque el conjunto de roles cambia
 * como mucho una vez al año, mientras que se consulta en cada escritura.
 */
@Injectable()
export class RoleCatalog {
  private cache: Map<string, string> | null = null;

  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async idFor(code: RoleCode, db?: Database): Promise<string> {
    const cached = (await this.load(db)).get(code);
    if (cached) return cached;

    // El rol podría haberse creado después de cargar la caché: se refresca una
    // vez antes de dar el error por bueno.
    this.cache = null;
    const refreshed = (await this.load(db)).get(code);
    if (refreshed) return refreshed;

    throw new InfrastructureError(
      `El rol "${code}" no existe en el catálogo. ¿Falta ejecutar la siembra?`,
      'ROLE_CATALOG_MISSING_ROLE',
    );
  }

  async codeFor(roleId: string, db?: Database): Promise<RoleCode | null> {
    const map = await this.load(db);
    for (const [code, id] of map.entries()) {
      if (id === roleId) return code as RoleCode;
    }
    return null;
  }

  invalidate(): void {
    this.cache = null;
  }

  private async load(db?: Database): Promise<Map<string, string>> {
    if (this.cache) return this.cache;

    const rows = await (db ?? this.database)
      .select({ id: roles.id, code: roles.code })
      .from(roles);

    this.cache = new Map(rows.map((row) => [row.code, row.id]));
    return this.cache;
  }

  /** Utilidad para consultas puntuales por código. */
  async exists(code: string): Promise<boolean> {
    const rows = await this.database
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.code, code))
      .limit(1);
    return rows.length > 0;
  }
}
