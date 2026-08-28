import { and, count, eq, forecastAssignments, auditLog, teamMembers } from '@kora/db';
import { createEtlContext, type EtlContext } from './lib/context';

interface Check {
  readonly name: string;
  readonly expected: number;
  readonly actual: number;
  readonly note: string;
}

const KNOWN_TYPES = ['Proyecto', 'Soporte', 'Vacaciones', 'Día administrativo', 'Día libre', 'Licencia médica', 'Capacitación', 'Otros'];

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

  // "Esperado" replica exactamente las condiciones de omisión de migrate-forecast.ts:
  // tipo reconocido, período de lunes a viernes, HH no negativas, y el miembro
  // referenciado debe haber migrado a `team_members` (algunos `equipo_miembro`
  // quedaron huérfanos en M2 por `user_id` no resoluble).
  const legacyRows = await context.legacy<Array<{ id_miembro: number; tipo: string; hh_asignadas: string; es_semana_completa: boolean }>>`
    select id_miembro, tipo, hh_asignadas,
           (extract(dow from periodo_inicio) = 1 and periodo_fin - periodo_inicio = 4) as es_semana_completa
    from public.forecast_asignacion
  `;
  const migratedMemberLegacyIds = new Set(
    (await context.target.select({ legacyId: teamMembers.legacyId }).from(teamMembers))
      .map((row) => row.legacyId)
      .filter((id): id is number => id !== null),
  );

  const expectedAssignments = legacyRows.filter((row) => {
    if (!KNOWN_TYPES.includes(row.tipo?.trim())) return false;
    if (!row.es_semana_completa) return false;
    const hours = Number(row.hh_asignadas);
    if (!Number.isFinite(hours) || hours < 0) return false;
    return migratedMemberLegacyIds.has(row.id_miembro);
  }).length;

  const [targetAssignments] = await context.target.select({ value: count() }).from(forecastAssignments);
  checks.push({
    name: 'asignaciones de forecast',
    expected: expectedAssignments,
    actual: targetAssignments?.value ?? 0,
    note: 'excluye tipo no reconocido, período que no es una semana completa, HH inválidas, y miembros huérfanos de M2',
  });

  const [legacyHistory] = await context.legacy<[{ total: number }]>`
    select count(*)::int as total from public.forecast_asignacion_log
    where action in ('created', 'updated', 'deleted')
  `;
  const [targetHistory] = await context.target
    .select({ value: count() })
    .from(auditLog)
    .where(and(eq(auditLog.entityType, 'forecast_assignment')));
  checks.push({
    name: 'historial de forecast (en audit_log)',
    expected: legacyHistory?.total ?? 0,
    actual: targetHistory?.value ?? 0,
    note: 'todo el historial se conserva, incluidas las filas con id_asignacion huérfano (igual que en la v1)',
  });

  return checks;
}

function report(checks: Check[]): void {
  console.log('\nVerificación de forecast');
  console.log('─'.repeat(78));
  for (const check of checks) {
    const okay = check.expected === check.actual;
    console.log(
      `${okay ? 'OK  ' : 'FALLA'} ${check.name.padEnd(38)} esperado: ${String(check.expected).padStart(5)}  obtenido: ${String(check.actual).padStart(5)}`,
    );
    console.log(`     ${check.note}`);
  }
}

main().catch((error: unknown) => {
  console.error('Falló la verificación:', error);
  process.exit(1);
});
