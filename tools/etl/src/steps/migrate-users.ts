import { eq, roles, teams, userCredentials, userIdentities, users } from '@kora/db';
import { StepTracker, type EtlContext } from '../lib/context';
import { mapLegacyRole, mapLegacyStatus, normalizeEmail } from '../lib/role-mapping';

/**
 * Migra la identidad de las personas: `usuario` + `profiles` + `auth.users` → `users`.
 *
 * El punto delicado de toda la migración está aquí. En la v1 una misma persona
 * vive en tres tablas que se enlazan de formas distintas:
 *
 *   - `usuario`  — la ficha de negocio (nombre, rol, equipo), con `id_usuario`
 *                  numérico, al que apuntan proyectos, tickets y participaciones.
 *   - `profiles` — el estado de la cuenta, con `user_id` (UUID de Supabase Auth),
 *                  al que apuntan `registro_hh`, `equipo_miembro` y las demás
 *                  tablas operativas.
 *   - `auth.users` — las credenciales reales, gestionadas por GoTrue.
 *
 * `usuario.auth_user_id` DEBERÍA unir las dos primeras, pero está a nulo en 55
 * de las 58 filas: el enlace que funciona de verdad es el CORREO. Por eso el
 * ETL une por correo normalizado y conserva AMBOS identificadores heredados
 * (`legacy_id` y `legacy_auth_user_id`) en cada usuario nuevo.
 *
 * Conservar los dos no es un lujo: cuando se migren las horas registradas, los
 * tickets y los proyectos, cada una de esas tablas apunta a uno u otro, y sin
 * ambos no habría forma de reconectarlas.
 */

interface LegacyUserRow {
  id_usuario: number;
  nombre_usuario: string;
  apellido_usuario: string;
  correo_usuario: string;
  rol: number;
  id_equipo: number | null;
  auth_user_id: string | null;
  es_responsable_comercial: boolean;
  profile_user_id: string | null;
  profile_estado: string | null;
  auth_id: string | null;
  encrypted_password: string | null;
  email_confirmed_at: Date | null;
  last_sign_in_at: Date | null;
}

export async function migrateUsers(context: EtlContext): Promise<void> {
  const tracker = new StepTracker('usuarios');

  // Una sola consulta reúne las tres fuentes. Los LEFT JOIN son deliberados:
  // una persona sin perfil o sin cuenta de acceso debe migrarse igualmente —de
  // hecho es el caso mayoritario— y perderla por un INNER JOIN sería el error
  // más caro posible.
  const rows = await context.legacy<LegacyUserRow[]>`
    select
      u.id_usuario,
      u.nombre_usuario,
      u.apellido_usuario,
      u.correo_usuario,
      u.rol,
      u.id_equipo,
      u.auth_user_id,
      -- El selector de la v1 no lee este flag sino el catálogo
      -- responsable_comercial (filas visibles); solo 4 de sus 10 personas
      -- tenían además el flag. Se considera comercial a quien cumpla cualquiera.
      (u.es_responsable_comercial or exists (
        select 1 from public.responsable_comercial rc
        where rc.legacy_usuario_id = u.id_usuario and rc.visible_en_selector
      )) as es_responsable_comercial,
      p.user_id  as profile_user_id,
      p.estado   as profile_estado,
      a.id       as auth_id,
      a.encrypted_password,
      a.email_confirmed_at,
      a.last_sign_in_at
    from public.usuario u
    left join public.profiles p
      on lower(btrim(p.mail)) = lower(btrim(u.correo_usuario))
    left join auth.users a
      on lower(btrim(a.email)) = lower(btrim(u.correo_usuario))
    order by u.id_usuario
  `;

  tracker.read = rows.length;

  const roleIds = await loadRoleIds(context);
  const teamIds = await loadTeamIdsByLegacyId(context);
  const seenEmails = new Map<string, number>();

  for (const row of rows) {
    const email = normalizeEmail(row.correo_usuario);
    if (!email) {
      tracker.warn(`usuario ${row.id_usuario} sin correo; se omite`);
      tracker.skipped += 1;
      continue;
    }

    // Dos filas de origen con el mismo correo serían dos personas distintas
    // según la v1 y una sola según la v2. Se migra la primera y se informa de
    // la segunda para que alguien decida: fusionarlas automáticamente podría
    // mezclar los datos de dos personas.
    const duplicateOf = seenEmails.get(email);
    if (duplicateOf !== undefined) {
      tracker.warn(
        `usuario ${row.id_usuario} duplica el correo ${email} (ya usado por ${duplicateOf}); requiere resolución manual`,
      );
      tracker.skipped += 1;
      continue;
    }
    seenEmails.set(email, row.id_usuario);

    const { role, warning: roleWarning } = mapLegacyRole(row.rol);
    if (roleWarning) tracker.warn(`usuario ${row.id_usuario}: ${roleWarning}`);

    const { status, warning: statusWarning } = mapLegacyStatus(row.profile_estado);
    if (statusWarning) tracker.warn(`usuario ${row.id_usuario}: ${statusWarning}`);

    const roleId = roleIds.get(role);
    if (!roleId) {
      tracker.warn(`usuario ${row.id_usuario}: el rol "${role}" no existe en destino; se omite`);
      tracker.skipped += 1;
      continue;
    }

    // Los roles administrativos y el comercial no llevan equipo en la v2. La
    // regla la aplica también el dominio; aquí se replica para que los datos
    // migrados nazcan ya conformes y no haya que limpiarlos después.
    const teamId =
      role === 'collaborator' || role === 'leader'
        ? (row.id_equipo !== null ? (teamIds.get(row.id_equipo) ?? null) : null)
        : null;

    if (row.id_equipo !== null && teamId === null && (role === 'collaborator' || role === 'leader')) {
      tracker.warn(`usuario ${row.id_usuario}: el equipo ${row.id_equipo} no existe en destino`);
    }

    // El UUID heredado sale del perfil (que es el que usan las tablas
    // operativas) y, si falta, del propio `usuario`.
    const legacyAuthUserId = row.profile_user_id ?? row.auth_user_id ?? null;


    const existing = await context.target
      .select({ id: users.id })
      .from(users)
      .where(eq(users.legacyId, row.id_usuario))
      .limit(1);

    let userId: string;

    if (existing[0]) {
      userId = existing[0].id;
      await context.target
        .update(users)
        .set({
          email,
          firstName: row.nombre_usuario.trim(),
          lastName: row.apellido_usuario.trim(),
          roleId,
          teamId,
          status,
          isCommercialManager: row.es_responsable_comercial,
          legacyAuthUserId,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
      tracker.updated += 1;
    } else {
      const inserted = await context.target
        .insert(users)
        .values({
          legacyId: row.id_usuario,
          legacyAuthUserId,
          email,
          firstName: row.nombre_usuario.trim(),
          lastName: row.apellido_usuario.trim(),
          roleId,
          teamId,
          status,
          isCommercialManager: row.es_responsable_comercial,
        })
        .returning({ id: users.id });

      const createdId = inserted[0]?.id;
      if (!createdId) {
        tracker.warn(`usuario ${row.id_usuario}: la inserción no devolvió identificador`);
        tracker.skipped += 1;
        continue;
      }
      userId = createdId;
      tracker.created += 1;
    }

    await migrateCredentials(context, tracker, userId, row);
    await migrateIdentity(context, userId, legacyAuthUserId, email);
  }

  context.report.add(tracker.toResult());
}

/**
 * Traslada la contraseña tal cual, marcada como bcrypt.
 *
 * NO se re-hashea aquí: para eso haría falta la contraseña en claro, que nadie
 * tiene. Se copia el hash de GoTrue y se anota su algoritmo; el caso de uso de
 * login lo verifica con bcrypt y lo regraba en argon2id la primera vez que la
 * persona entra. Resultado: nadie pierde su contraseña y, en unas semanas de
 * uso normal, ya no queda ningún bcrypt en la base.
 */
async function migrateCredentials(
  context: EtlContext,
  tracker: StepTracker,
  userId: string,
  row: LegacyUserRow,
): Promise<void> {
  if (!row.encrypted_password) {
    // Sin cuenta en `auth.users`: la persona existe como ficha, pero no puede
    // entrar. No se le crea credencial; un administrador le enviará invitación.
    return;
  }

  const algorithm = row.encrypted_password.startsWith('$2') ? 'bcrypt' : null;
  if (!algorithm) {
    tracker.warn(
      `usuario ${row.id_usuario}: formato de contraseña no reconocido; se migra sin acceso`,
    );
    return;
  }

  await context.target
    .insert(userCredentials)
    .values({
      userId,
      passwordHash: row.encrypted_password,
      passwordAlgorithm: 'bcrypt',
      mustChangePassword: false,
      emailVerifiedAt: row.email_confirmed_at,
      lastLoginAt: row.last_sign_in_at,
    })
    .onConflictDoUpdate({
      target: userCredentials.userId,
      set: {
        passwordHash: row.encrypted_password,
        passwordAlgorithm: 'bcrypt',
        emailVerifiedAt: row.email_confirmed_at,
        lastLoginAt: row.last_sign_in_at,
        updatedAt: new Date(),
      },
    });
}

/** Deja constancia del origen Supabase de la identidad, para trazabilidad. */
async function migrateIdentity(
  context: EtlContext,
  userId: string,
  legacyAuthUserId: string | null,
  email: string,
): Promise<void> {
  if (!legacyAuthUserId) return;

  await context.target
    .insert(userIdentities)
    .values({
      userId,
      provider: 'legacy_supabase',
      providerAccountId: legacyAuthUserId,
      email,
    })
    .onConflictDoNothing();
}

async function loadRoleIds(context: EtlContext): Promise<Map<string, string>> {
  const rows = await context.target.select({ id: roles.id, code: roles.code }).from(roles);
  return new Map(rows.map((row) => [row.code, row.id]));
}

async function loadTeamIdsByLegacyId(context: EtlContext): Promise<Map<number, string>> {
  const rows = await context.target
    .select({ id: teams.id, legacyId: teams.legacyId })
    .from(teams);

  const map = new Map<number, string>();
  for (const row of rows) {
    if (row.legacyId !== null) map.set(row.legacyId, row.id);
  }
  return map;
}
