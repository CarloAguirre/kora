import { count, ticketHistoryEntries, tickets, supportMonthlyPeriods, supportPlans } from '@kora/db';
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

  const [legacyTickets] = await context.legacy<[{ total: number }]>`select count(*)::int as total from public.ticket`;
  const [targetTickets] = await context.target.select({ value: count() }).from(tickets);
  checks.push({
    name: 'tickets',
    expected: legacyTickets?.total ?? 0,
    actual: targetTickets?.value ?? 0,
    note: 'correspondencia uno a uno: ningún ticket se omite por diseño',
  });

  const [legacyHistory] = await context.legacy<[{ total: number }]>`
    select count(*)::int as total from public.ticket_history th
    where exists (select 1 from public.ticket t where t.id_ticket = th.id_ticket)
  `;
  const [targetHistory] = await context.target.select({ value: count() }).from(ticketHistoryEntries);
  checks.push({
    name: 'historial de tickets',
    expected: legacyHistory?.total ?? 0,
    actual: targetHistory?.value ?? 0,
    note: 'excluye filas con id_ticket huérfano en el propio origen',
  });

  const [legacyPlans] = await context.legacy<[{ total: number }]>`select count(*)::int as total from public.soporte_plan_contrato`;
  const [targetPlans] = await context.target.select({ value: count() }).from(supportPlans);
  checks.push({
    name: 'planes de soporte',
    expected: legacyPlans?.total ?? 0,
    actual: targetPlans?.value ?? 0,
    note: 'correspondencia uno a uno',
  });

  const [legacyPeriods] = await context.legacy<[{ total: number }]>`select count(*)::int as total from public.soporte_periodo_mensual`;
  const [targetPeriods] = await context.target.select({ value: count() }).from(supportMonthlyPeriods);
  checks.push({
    name: 'períodos mensuales',
    expected: legacyPeriods?.total ?? 0,
    actual: targetPeriods?.value ?? 0,
    note: 'correspondencia uno a uno',
  });

  return checks;
}

function report(checks: Check[]): void {
  console.log('\nVerificación de tickets y planes de soporte');
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
