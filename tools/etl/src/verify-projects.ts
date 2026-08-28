import { count, projectTeamMembers, projectTeams, projects, sql } from '@kora/db';
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

  const [legacyProjects] = await context.legacy<[{ total: number }]>`
    select count(*)::int as total from public.proyecto
  `;
  const [targetProjects] = await context.target.select({ value: count() }).from(projects);
  checks.push({
    name: 'proyectos',
    expected: legacyProjects?.total ?? 0,
    actual: targetProjects?.value ?? 0,
    note: 'correspondencia uno a uno: ningún proyecto se omite por diseño',
  });

  const [legacyFinished] = await context.legacy<[{ total: number }]>`
    select count(*)::int as total from public.proyecto
    where etapa = 'Finalizado' or fase_proyecto = 'Finalizado'
  `;
  const targetFinished = await context.target.execute<{ total: number }>(
    sql`select count(*)::int as total from projects where status = 'finished'`,
  );
  checks.push({
    name: 'proyectos finalizados',
    expected: legacyFinished?.total ?? 0,
    actual: Number((targetFinished as unknown as Array<{ total: number }>)[0]?.total ?? 0),
    note: 'ver docs/DECISION-M3-ESTADOS.md: manda etapa/fase_proyecto, no estado_proyecto',
  });

  const [legacyTeams] = await context.legacy<[{ total: number }]>`
    select count(*)::int as total from public.equipo_proyecto
  `;
  const [targetTeams] = await context.target.select({ value: count() }).from(projectTeams);
  checks.push({
    name: 'equipos de proyecto',
    expected: legacyTeams?.total ?? 0,
    actual: targetTeams?.value ?? 0,
    note: 'correspondencia uno a uno',
  });

  const [legacyMembers] = await context.legacy<[{ total: number }]>`
    select count(*)::int as total from public.proyecto_colaborador
  `;
  const [targetMembers] = await context.target.select({ value: count() }).from(projectTeamMembers);
  checks.push({
    name: 'miembros asignados',
    expected: legacyMembers?.total ?? 0,
    actual: targetMembers?.value ?? 0,
    note: 'puede haber diferencia si algún equipo/miembro de origen no se migró (ver avisos)',
  });

  return checks;
}

function report(checks: Check[]): void {
  console.log('\nVerificación de proyectos');
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
