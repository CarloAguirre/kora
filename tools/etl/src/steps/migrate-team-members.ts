import { eq, isNotNull, teamMembers, teams, users } from '@kora/db';
import { StepTracker, type EtlContext } from '../lib/context';
import { normalizeEmail } from '../lib/role-mapping';

/**
 * Migra `equipo_miembro` → `team_members` y asigna el líder de cada equipo.
 *
 * `equipo_miembro` referencia a la persona por el UUID de Supabase
 * (`user_id`), no por `id_usuario`; por eso los usuarios se migran primero
 * conservando `legacy_auth_user_id`, que es justo la clave que permite
 * reconectar estas filas.
 *
 * Cinco de las 47 filas de origen tienen un `user_id` que no corresponde a
 * ningún perfil: se informan y se omiten en lugar de inventarles un dueño.
 */

interface LegacyTeamMember {
  id: number;
  id_equipo: number;
  nombre: string;
  cargo: string | null;
  horas_disponibles_semana: number | null;
  user_id: string | null;
  created_at: Date;
}

interface LegacyTeamLeader {
  id: number;
  id_usuario: number | null;
}

export async function migrateTeamMembers(context: EtlContext): Promise<void> {
  await assignTeamLeaders(context);

  const tracker = new StepTracker('miembros de equipo');

  const rows = await context.legacy<LegacyTeamMember[]>`
    select id, id_equipo, nombre, cargo, horas_disponibles_semana, user_id, created_at
    from public.equipo_miembro
    order by id
  `;

  tracker.read = rows.length;

  const teamIds = await loadTeamIdsByLegacyId(context);
  const userIdsByLegacyAuth = await loadUserIdsByLegacyAuthId(context);

  for (const row of rows) {
    const teamId = teamIds.get(row.id_equipo);
    if (!teamId) {
      tracker.warn(`miembro ${row.id}: el equipo ${row.id_equipo} no existe en destino`);
      tracker.skipped += 1;
      continue;
    }

    const userId = row.user_id ? userIdsByLegacyAuth.get(row.user_id) : undefined;
    if (!userId) {
      tracker.warn(
        `miembro ${row.id} ("${row.nombre}"): no se pudo resolver el usuario ${row.user_id ?? 'nulo'}`,
      );
      tracker.skipped += 1;
      continue;
    }


    const existing = await context.target
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(eq(teamMembers.legacyId, row.id))
      .limit(1);

    const values = {
      teamId,
      userId,
      position: row.cargo?.trim() || null,
      weeklyHours: String(row.horas_disponibles_semana ?? 44),
    };

    if (existing[0]) {
      await context.target
        .update(teamMembers)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(teamMembers.id, existing[0].id));
      tracker.updated += 1;
    } else {
      await context.target.insert(teamMembers).values({
        ...values,
        legacyId: row.id,
        joinedAt: row.created_at ?? new Date(),
      });
      tracker.created += 1;
    }
  }

  context.report.add(tracker.toResult());
}

/**
 * Asigna el líder de cada equipo, ya con los usuarios creados.
 *
 * Este es el segundo tramo del ciclo que se rompió al migrar equipos antes que
 * usuarios: ahora ya existe a quién apuntar.
 */
async function assignTeamLeaders(context: EtlContext): Promise<void> {
  const tracker = new StepTracker('líderes de equipo');

  const rows = await context.legacy<LegacyTeamLeader[]>`
    select id, id_usuario
    from public.lider_equipo
    where id_usuario is not null
    order by id
  `;

  tracker.read = rows.length;

  const userIdsByLegacyId = await loadUserIdsByLegacyId(context);
  const teamIds = await loadTeamIdsByLegacyId(context);

  for (const row of rows) {
    const teamId = teamIds.get(row.id);
    const leaderId = row.id_usuario !== null ? userIdsByLegacyId.get(row.id_usuario) : undefined;

    if (!teamId) {
      tracker.warn(`equipo ${row.id} no encontrado en destino`);
      tracker.skipped += 1;
      continue;
    }
    if (!leaderId) {
      tracker.warn(`equipo ${row.id}: el líder ${row.id_usuario} no existe en destino`);
      tracker.skipped += 1;
      continue;
    }


    await context.target
      .update(teams)
      .set({ leaderUserId: leaderId, updatedAt: new Date() })
      .where(eq(teams.id, teamId));
    tracker.updated += 1;
  }

  context.report.add(tracker.toResult());
}

async function loadTeamIdsByLegacyId(context: EtlContext): Promise<Map<number, string>> {
  const rows = await context.target.select({ id: teams.id, legacyId: teams.legacyId }).from(teams);
  const map = new Map<number, string>();
  for (const row of rows) if (row.legacyId !== null) map.set(row.legacyId, row.id);
  return map;
}

async function loadUserIdsByLegacyId(context: EtlContext): Promise<Map<number, string>> {
  const rows = await context.target.select({ id: users.id, legacyId: users.legacyId }).from(users);
  const map = new Map<number, string>();
  for (const row of rows) if (row.legacyId !== null) map.set(row.legacyId, row.id);
  return map;
}

async function loadUserIdsByLegacyAuthId(context: EtlContext): Promise<Map<string, string>> {
  const rows = await context.target
    .select({ id: users.id, legacyAuthUserId: users.legacyAuthUserId })
    .from(users)
    .where(isNotNull(users.legacyAuthUserId));

  const map = new Map<string, string>();
  for (const row of rows) if (row.legacyAuthUserId) map.set(row.legacyAuthUserId, row.id);
  return map;
}

/** Se conserva por si hiciera falta resolver miembros por correo en el futuro. */
export function emailKey(email: string | null): string | null {
  return normalizeEmail(email);
}
