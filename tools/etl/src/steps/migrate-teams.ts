import { eq, teams } from '@kora/db';
import { StepTracker, type EtlContext } from '../lib/context';

/**
 * Migra `lider_equipo` → `teams`.
 *
 * Se ejecuta ANTES que los usuarios porque `users.team_id` apunta aquí. El
 * líder de cada equipo se asigna en un paso posterior, una vez que los usuarios
 * existen: la referencia es circular (un equipo tiene líder, y el líder es un
 * usuario que pertenece a un equipo) y romperla en dos pasos es más simple que
 * diferir restricciones.
 */

interface LegacyTeam {
  id: number;
  nombre_equipo: string;
  id_usuario: number | null;
  created_at: Date;
}

export async function migrateTeams(context: EtlContext): Promise<void> {
  const tracker = new StepTracker('equipos');

  const rows = await context.legacy<LegacyTeam[]>`
    select id, nombre_equipo, id_usuario, created_at
    from public.lider_equipo
    order by id
  `;

  tracker.read = rows.length;

  for (const row of rows) {
    const name = row.nombre_equipo?.trim();
    if (!name) {
      tracker.warn(`equipo ${row.id} sin nombre; se omite`);
      tracker.skipped += 1;
      continue;
    }


    // `onConflictDoUpdate` sobre `legacy_id` hace el paso idempotente: se puede
    // reejecutar el ETL las veces que haga falta —y hará falta, porque una
    // migración real se ensaya muchas veces— sin duplicar ni una fila.
    const existing = await context.target
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.legacyId, row.id))
      .limit(1);

    if (existing.length > 0) {
      await context.target
        .update(teams)
        .set({ name, updatedAt: new Date() })
        .where(eq(teams.legacyId, row.id));
      tracker.updated += 1;
    } else {
      await context.target.insert(teams).values({
        legacyId: row.id,
        name,
        isActive: true,
        createdAt: row.created_at ?? new Date(),
      });
      tracker.created += 1;
    }
  }

  context.report.add(tracker.toResult());
}
