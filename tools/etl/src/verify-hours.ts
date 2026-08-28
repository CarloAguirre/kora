import { count, eq, holidays, hourEntries } from '@kora/db';
import { createEtlContext, type EtlContext } from './lib/context';

interface Check {
  readonly name: string;
  readonly expected: number;
  readonly actual: number;
  readonly note: string;
}

async function main(): Promise<void> {
  const context = await createEtlContext();

  try {
    const checks = await runChecks(context);
    report(checks);

    const failures = checks.filter((check) => check.expected !== check.actual);
    if (failures.length > 0) {
      console.error(`\n${failures.length} verificación(es) no cuadran.`);
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

  const [legacyHoliday] = await context.legacy<[{ total: number }]>`
    select count(*)::int as total from public.feriado
  `;
  const [targetHoliday] = await context.target.select({ value: count() }).from(holidays);
  checks.push({
    name: 'feriados',
    expected: legacyHoliday?.total ?? 0,
    actual: targetHoliday?.value ?? 0,
    note: 'correspondencia uno a uno',
  });

  // Filas con `user_id` huérfano (no existe en `usuario`) se excluyen del esperado:
  // no es un usuario sin migrar, es una referencia rota en el propio origen —
  // ver docs/DECISION-M4-HORAS.md.
  const [legacyEntries] = await context.legacy<[{ total: number }]>`
    select count(*)::int as total
    from public.registro_hh r
    where exists (select 1 from public.profiles p where p.user_id = r.user_id)
       or exists (select 1 from public.usuario u where u.auth_user_id = r.user_id)
  `;
  const [targetEntries] = await context.target.select({ value: count() }).from(hourEntries);
  checks.push({
    name: 'registros de horas',
    expected: legacyEntries?.total ?? 0,
    actual: targetEntries?.value ?? 0,
    note: 'excluye filas de origen con user_id huérfano (sin fila en usuario); ver avisos de la migración',
  });

  const [legacyApproved] = await context.legacy<[{ total: number }]>`
    select count(*)::int as total
    from public.registro_hh r
    where r.estado = 'aprobado'
      and (
        exists (select 1 from public.profiles p where p.user_id = r.user_id)
        or exists (select 1 from public.usuario u where u.auth_user_id = r.user_id)
      )
  `;
  const [targetApproved] = await context.target.select({ value: count() }).from(hourEntries).where(eq(hourEntries.status, 'approved'));
  checks.push({
    name: 'registros aprobados',
    expected: legacyApproved?.total ?? 0,
    actual: targetApproved?.value ?? 0,
    note: 'el estado se preserva tal cual, no se recalcula',
  });

  return checks;
}

function report(checks: Check[]): void {
  console.log('\nVerificación de registro de horas');
  console.log('─'.repeat(78));
  for (const check of checks) {
    const okay = check.expected === check.actual;
    console.log(
      `${okay ? 'OK  ' : 'FALLA'} ${check.name.padEnd(32)} esperado: ${String(check.expected).padStart(5)}  obtenido: ${String(check.actual).padStart(5)}`,
    );
    console.log(`     ${check.note}`);
  }
}

main().catch((error: unknown) => {
  console.error('Falló la verificación:', error);
  process.exit(1);
});
