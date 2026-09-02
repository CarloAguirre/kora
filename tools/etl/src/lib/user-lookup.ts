import { isNotNull, users } from '@kora/db';
import type { EtlContext } from './context';
import { normalizeEmail } from './role-mapping';

/**
 * Mapas para emparejar personas legacy contra `users` ya migrados.
 *
 * Estaban duplicados de forma idéntica en migrate-hours.ts, migrate-tickets.ts,
 * migrate-forecast.ts y migrate-team-members.ts; viven acá una sola vez.
 */

export async function loadUserIdsByLegacyAuthId(context: EtlContext): Promise<Map<string, string>> {
  const rows = await context.target
    .select({ id: users.id, legacyAuthUserId: users.legacyAuthUserId })
    .from(users)
    .where(isNotNull(users.legacyAuthUserId));

  const map = new Map<string, string>();
  for (const row of rows) if (row.legacyAuthUserId) map.set(row.legacyAuthUserId, row.id);
  return map;
}

export async function loadUserIdsByLegacyId(context: EtlContext): Promise<Map<number, string>> {
  const rows = await context.target.select({ id: users.id, legacyId: users.legacyId }).from(users);
  const map = new Map<number, string>();
  for (const row of rows) if (row.legacyId !== null) map.set(row.legacyId, row.id);
  return map;
}

export async function loadUserIdsByEmail(context: EtlContext): Promise<Map<string, string>> {
  const rows = await context.target.select({ id: users.id, email: users.email }).from(users);
  const map = new Map<string, string>();
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (email) map.set(email, row.id);
  }
  return map;
}

interface LegacyUsuarioAuthRow {
  auth_user_id: string | null;
  correo_usuario: string | null;
}

/**
 * `auth_user_id` (UUID de Supabase) → correo, según la tabla legacy `usuario`.
 *
 * Alimenta el último recurso de `resolveUserId`: cuando la cuenta de Supabase
 * de alguien se recrea (se le da de baja y de alta de nuevo, o se le resuelve
 * un problema de acceso creándole una cuenta nueva), el UUID cambia pero el
 * correo no — y sin este mapa, todo el historial que quedó grabado con el
 * UUID viejo (horas, tickets, forecast) se pierde en silencio en la próxima
 * importación, aunque la persona siga activa. Caso real: mangel.tort@kabeli.cl
 * perdía 149 registros de horas por esto.
 */
export async function loadLegacyEmailByAuthId(context: EtlContext): Promise<Map<string, string>> {
  const rows = await context.legacyReader.getRows<LegacyUsuarioAuthRow>('usuario');
  const map = new Map<string, string>();
  for (const row of rows) {
    const email = normalizeEmail(row.correo_usuario);
    if (row.auth_user_id && email) map.set(row.auth_user_id, email);
  }
  return map;
}

export interface UserMatch {
  readonly userId: string | null;
  readonly matchedBy: 'auth' | 'email' | null;
}

/**
 * Resuelve un `user_id` legacy (UUID de Supabase) contra `users` ya
 * migrados: primero por el UUID directo; si no matchea, reintenta por el
 * correo de la persona en la tabla legacy `usuario` (ver
 * `loadLegacyEmailByAuthId`) antes de darse por vencido.
 */
export function resolveUserId(
  legacyAuthUserId: string | null | undefined,
  userIdsByLegacyAuth: ReadonlyMap<string, string>,
  legacyEmailByAuthId: ReadonlyMap<string, string>,
  userIdsByEmail: ReadonlyMap<string, string>,
): UserMatch {
  if (!legacyAuthUserId) return { userId: null, matchedBy: null };

  const direct = userIdsByLegacyAuth.get(legacyAuthUserId);
  if (direct) return { userId: direct, matchedBy: 'auth' };

  const email = legacyEmailByAuthId.get(legacyAuthUserId);
  const viaEmail = email ? userIdsByEmail.get(email) : undefined;
  if (viaEmail) return { userId: viaEmail, matchedBy: 'email' };

  return { userId: null, matchedBy: null };
}
