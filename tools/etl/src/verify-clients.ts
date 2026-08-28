import { clientContacts, clients, count, isNotNull, sql } from '@kora/db';
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

  const [legacyClients] = await context.legacy<[{ total: number }]>`
    select count(*)::int as total from public.cliente where rut_empresa is not null and btrim(rut_empresa) <> ''
  `;
  const [targetClients] = await context.target.select({ value: count() }).from(clients);

  checks.push({
    name: 'clientes',
    expected: legacyClients?.total ?? 0,
    actual: targetClients?.value ?? 0,
    note: 'origen con RUT no vacío (única causa válida de omisión)',
  });

  const [legacyLinkedContacts] = await context.legacy<[{ total: number }]>`
    select count(*)::int as total from public.cliente where id_contacto is not null
  `;
  const [targetContactsWithClient] = await context.target
    .select({ value: count() })
    .from(clientContacts)
    .where(isNotNull(clientContacts.clientId));

  checks.push({
    name: 'contactos enlazados a un cliente',
    expected: legacyLinkedContacts?.total ?? 0,
    actual: targetContactsWithClient?.value ?? 0,
    note: 'clientes de origen con id_contacto asignado',
  });

  const [legacyActive] = await context.legacy<[{ total: number }]>`
    select count(*)::int as total from public.cliente where estado_cliente = 'Activo'
  `;
  const targetActive = await context.target.execute<{ total: number }>(
    sql`select count(*)::int as total from clients where status = 'active'`,
  );

  checks.push({
    name: 'clientes activos',
    expected: legacyActive?.total ?? 0,
    actual: Number((targetActive as unknown as Array<{ total: number }>)[0]?.total ?? 0),
    note: 'debe coincidir exactamente: es un campo mapeado 1 a 1',
  });

  return checks;
}

function report(checks: Check[]): void {
  console.log('\nVerificación de catálogos y clientes');
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
