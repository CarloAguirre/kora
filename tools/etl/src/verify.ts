import { count, isNotNull, sql, teamMembers, teams, userCredentials, users } from '@kora/db';
import { createEtlContext, type EtlContext } from './lib/context';

/**
 * Verificación posterior a la migración.
 *
 * Migrar sin verificar es confiar en que no hubo ni un fallo silencioso. Este
 * script compara origen y destino y falla si algo no cuadra, para que la
 * migración sea una operación con resultado comprobable y no un acto de fe.
 *
 * Cada comprobación explica qué se espera y por qué, de modo que una diferencia
 * legítima (por ejemplo, filas de origen descartadas a propósito) se distinga
 * de un error real.
 */

interface Check {
  readonly name: string;
  readonly expected: number;
  readonly actual: number;
  readonly tolerance: number;
  readonly note: string;
}

async function main(): Promise<void> {
  const context = await createEtlContext();

  try {
    const checks = await runChecks(context);
    report(checks);

    const failures = checks.filter((check) => Math.abs(check.expected - check.actual) > check.tolerance);

    if (failures.length > 0) {
      console.error(`\n${failures.length} verificación(es) no cuadran. Revisa antes de continuar.`);
      process.exitCode = 1;
      return;
    }

    console.log('\nTodas las verificaciones cuadran.');
  } finally {
    await context.close();
  }
}

async function runChecks(context: EtlContext): Promise<Check[]> {
  const checks: Check[] = [];

  // 1. Todas las personas migradas.
  const [legacyUsers] = await context.legacy<[{ total: number }]>`
    select count(*)::int as total from public.usuario
  `;
  const [targetUsers] = await context.target.select({ value: count() }).from(users);

  const [legacyDuplicateEmails] = await context.legacy<[{ total: number }]>`
    select coalesce(sum(extra), 0)::int as total
    from (
      select count(*) - 1 as extra
      from public.usuario
      group by lower(btrim(correo_usuario))
      having count(*) > 1
    ) duplicates
  `;

  checks.push({
    name: 'usuarios',
    expected: (legacyUsers?.total ?? 0) - (legacyDuplicateEmails?.total ?? 0),
    actual: targetUsers?.value ?? 0,
    tolerance: 0,
    note: 'origen menos los correos duplicados, que se omiten a propósito',
  });

  // 2. Equipos.
  const [legacyTeams] = await context.legacy<[{ total: number }]>`
    select count(*)::int as total from public.lider_equipo
  `;
  const [targetTeams] = await context.target.select({ value: count() }).from(teams);

  checks.push({
    name: 'equipos',
    expected: legacyTeams?.total ?? 0,
    actual: targetTeams?.value ?? 0,
    tolerance: 0,
    note: 'correspondencia uno a uno',
  });

  // 3. Cuentas con acceso: solo quienes tenían credenciales en GoTrue.
  const [legacyAccounts] = await context.legacy<[{ total: number }]>`
    select count(*)::int as total
    from auth.users a
    where a.encrypted_password is not null
      and exists (
        select 1 from public.usuario u
        where lower(btrim(u.correo_usuario)) = lower(btrim(a.email))
      )
  `;
  const [targetCredentials] = await context.target
    .select({ value: count() })
    .from(userCredentials);

  checks.push({
    name: 'cuentas con acceso',
    expected: legacyAccounts?.total ?? 0,
    actual: targetCredentials?.value ?? 0,
    tolerance: 0,
    note: 'solo las que tenían contraseña y ficha de usuario asociada',
  });

  // 4. Pertenencias a equipos resolubles.
  const [legacyMembers] = await context.legacy<[{ total: number }]>`
    select count(*)::int as total
    from public.equipo_miembro em
    where em.user_id is not null
      and exists (select 1 from public.profiles p where p.user_id = em.user_id)
  `;
  const [targetMembers] = await context.target.select({ value: count() }).from(teamMembers);

  checks.push({
    name: 'miembros de equipo',
    expected: legacyMembers?.total ?? 0,
    actual: targetMembers?.value ?? 0,
    tolerance: 0,
    note: 'solo los que apuntan a un perfil existente',
  });

  // 5. Trazabilidad: todo usuario migrado conserva su identificador de origen.
  const [withLegacyId] = await context.target
    .select({ value: count() })
    .from(users)
    .where(isNotNull(users.legacyId));

  checks.push({
    name: 'trazabilidad legacy_id',
    expected: targetUsers?.value ?? 0,
    actual: withLegacyId?.value ?? 0,
    tolerance: 0,
    note: 'sin esto no se podrían migrar después horas, tickets ni proyectos',
  });

  // 6. Integridad: ni un correo duplicado en destino.
  const duplicates = await context.target.execute<{ total: number }>(
    sql`select count(*)::int as total from (
          select 1 from users where deleted_at is null
          group by lower(btrim(email)) having count(*) > 1
        ) d`,
  );

  checks.push({
    name: 'correos duplicados en destino',
    expected: 0,
    actual: Number((duplicates as unknown as Array<{ total: number }>)[0]?.total ?? 0),
    tolerance: 0,
    note: 'debe ser cero: lo garantiza el índice único',
  });

  // 7. Cobertura de roles: nadie debe haber caído en el rol por defecto sin
  //    tenerlo en origen.
  const [legacyCollaborators] = await context.legacy<[{ total: number }]>`
    select count(*)::int as total from public.usuario where rol in (3, 6)
  `;
  const targetCollaborators = await context.target.execute<{ total: number }>(
    sql`select count(*)::int as total
        from users u join roles r on r.id = u.role_id
        where r.code = 'collaborator'`,
  );

  checks.push({
    name: 'colaboradores',
    expected: legacyCollaborators?.total ?? 0,
    actual: Number((targetCollaborators as unknown as Array<{ total: number }>)[0]?.total ?? 0),
    tolerance: 0,
    note: 'un exceso aquí indicaría roles degradados por no reconocerse',
  });

  return checks;
}

function report(checks: Check[]): void {
  console.log('\nVerificación de la migración');
  console.log('─'.repeat(78));

  for (const check of checks) {
    const delta = check.actual - check.expected;
    const okay = Math.abs(delta) <= check.tolerance;
    const mark = okay ? 'OK  ' : 'FALLA';

    console.log(
      `${mark} ${check.name.padEnd(32)} esperado: ${String(check.expected).padStart(5)}` +
        `  obtenido: ${String(check.actual).padStart(5)}` +
        (okay ? '' : `  diferencia: ${delta > 0 ? '+' : ''}${delta}`),
    );
    console.log(`     ${check.note}`);
  }
}

main().catch((error: unknown) => {
  console.error('Falló la verificación:', error);
  process.exit(1);
});
