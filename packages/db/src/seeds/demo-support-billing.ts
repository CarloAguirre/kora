import { inArray } from 'drizzle-orm';
import type { Database } from '../client';
import { slugify } from '../lib/slug';
import { clients, hourEntries, projects, supportInvoices, supportMonthlyPeriods, supportPlanProjects, supportPlans } from '../schema';

/**
 * Siembra un contrato de soporte por cada variante que puede mostrar el
 * panel de Facturación → Soporte (`GetSupportBillingOverviewUseCase`) y la
 * ficha del contrato, para poder revisarlas contra Figma: tipo (a demanda /
 * bolsa / mensual acumulable / mensual con vencimiento) × estado de
 * facturación (por facturar / facturado / sin movimiento) × estado de pago
 * (pendiente / pagado / atrasado) × alertas (horas desviadas, exceso en el
 * último período, factura atrasada de un período anterior).
 *
 * Todo cuelga de UN cliente ficticio ("Demo Facturación Soporte") con ids
 * fijos, así que es fácil de ubicar y no toca datos reales. El nombre de
 * cada contrato describe la variante que muestra.
 *
 * Las fechas son RELATIVAS al mes en curso al momento de correrlo: el panel
 * solo calcula en vivo el mes calendario de hoy, así que con fechas fijas
 * los contratos quedarían "Sin movimiento" apenas cambie el mes. Es
 * idempotente — horas, períodos y facturas de estos contratos se reemplazan
 * en cada corrida —, así que basta volver a correrlo para "moverlo" al mes
 * nuevo.
 *
 * Se corre a mano con `pnpm --filter @kora/db seed:demo-support-billing`,
 * nunca como parte de un despliegue.
 */

// IDs reales, ya existentes en la base (ETL desde la v1) — NO se crean acá.
const REAL = {
  userJoseAponte: '5edce9f8-b995-43be-86c4-702aa929c2ee',
  userEduardoAranda: '064969c7-c586-4261-a7e6-255669ab4237',
  userSolmaryCastro: 'ea6d5a9b-e3bb-47f7-a064-60ac27a593fb',
} as const;

const CLIENT_ID = 'fac50000-0000-4000-8000-000000000001';
const CLIENT_NAME = 'Demo Facturación Soporte';

type Variant =
  | 'onDemandToInvoice'
  | 'onDemandInvoicedPending'
  | 'bundleDeviatedToInvoice'
  | 'bundleWithinQuota'
  | 'bundleInvoicedPaid'
  | 'monthlyAccumulateToInvoice'
  | 'monthlyAccumulateOverdue'
  | 'monthlyExpirePaid'
  | 'monthlyExpireLastPeriodOverage';

/** Plan y proyecto de desarrollo cubierto comparten sufijo: `fac5…0NN1` = plan, `fac5…0NN2` = proyecto. */
const IDS: Record<Variant, { plan: string; project: string }> = {
  onDemandToInvoice: { plan: 'fac50000-0000-4000-8000-000000000011', project: 'fac50000-0000-4000-8000-000000000012' },
  onDemandInvoicedPending: { plan: 'fac50000-0000-4000-8000-000000000021', project: 'fac50000-0000-4000-8000-000000000022' },
  bundleDeviatedToInvoice: { plan: 'fac50000-0000-4000-8000-000000000031', project: 'fac50000-0000-4000-8000-000000000032' },
  bundleWithinQuota: { plan: 'fac50000-0000-4000-8000-000000000041', project: 'fac50000-0000-4000-8000-000000000042' },
  bundleInvoicedPaid: { plan: 'fac50000-0000-4000-8000-000000000051', project: 'fac50000-0000-4000-8000-000000000052' },
  monthlyAccumulateToInvoice: { plan: 'fac50000-0000-4000-8000-000000000061', project: 'fac50000-0000-4000-8000-000000000062' },
  monthlyAccumulateOverdue: { plan: 'fac50000-0000-4000-8000-000000000071', project: 'fac50000-0000-4000-8000-000000000072' },
  monthlyExpirePaid: { plan: 'fac50000-0000-4000-8000-000000000081', project: 'fac50000-0000-4000-8000-000000000082' },
  monthlyExpireLastPeriodOverage: { plan: 'fac50000-0000-4000-8000-000000000091', project: 'fac50000-0000-4000-8000-000000000092' },
};

const utc = (year: number, monthIndex: number, day: number) => new Date(Date.UTC(year, monthIndex, day));
const periodKeyOf = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

export interface SeedDemoSupportBillingResult {
  period: string;
  plansSeeded: number;
}

export async function seedDemoSupportBilling(db: Database, today: Date = new Date()): Promise<SeedDemoSupportBillingResult> {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  /** Día `day` del mes `offset` relativo al actual (0 = este mes, -1 = el anterior…). Se acota a hoy para no registrar horas en el futuro. */
  const monthDay = (offset: number, day: number) => {
    const date = utc(y, m + offset, day);
    return offset === 0 && date.getTime() > today.getTime() ? utc(y, m, today.getUTCDate()) : date;
  };
  const monthStart = (offset: number) => utc(y, m + offset, 1);
  const currentPeriodKey = periodKeyOf(monthStart(0));
  const previousPeriodKey = periodKeyOf(monthStart(-1));
  /** Ayer — vencimiento ya pasado para las facturas "Atrasado" de este mes. */
  const yesterday = addDays(utc(y, m, today.getUTCDate()), -1);

  const planIds = Object.values(IDS).map((ids) => ids.plan);
  const projectIds = Object.values(IDS).map((ids) => ids.project);

  // 1. Cliente ficticio ————————————————————————————————————————————————
  await db
    .insert(clients)
    .values({
      id: CLIENT_ID,
      companyName: CLIENT_NAME,
      slug: slugify(CLIENT_NAME),
      legalName: 'Demo Facturación Soporte SpA',
      taxId: '99.999.001-K',
      status: 'active',
    })
    .onConflictDoUpdate({ target: clients.id, set: { companyName: CLIENT_NAME, taxId: '99.999.001-K', status: 'active', deletedAt: null } });

  // 2. Proyectos de desarrollo cubiertos (uno por contrato) ————————————————
  const projectNames: Record<Variant, string> = {
    onDemandToInvoice: 'Demo · Portal de clientes',
    onDemandInvoicedPending: 'Demo · App de ventas',
    bundleDeviatedToInvoice: 'Demo · Sistema de bodegas',
    bundleWithinQuota: 'Demo · Intranet RR.HH.',
    bundleInvoicedPaid: 'Demo · Bot de cobranza',
    monthlyAccumulateToInvoice: 'Demo · ERP integraciones',
    monthlyAccumulateOverdue: 'Demo · Plataforma e-commerce',
    monthlyExpirePaid: 'Demo · Dashboard gerencial',
    monthlyExpireLastPeriodOverage: 'Demo · App de terreno',
  };
  for (const [variant, ids] of Object.entries(IDS) as [Variant, (typeof IDS)[Variant]][]) {
    const name = projectNames[variant];
    await db
      .insert(projects)
      .values({
        id: ids.project,
        name,
        slug: slugify(name),
        clientId: CLIENT_ID,
        type: 'development',
        status: 'active',
        leaderUserId: REAL.userJoseAponte,
        startDate: monthStart(-8),
      })
      .onConflictDoUpdate({ target: projects.id, set: { name, status: 'active' } });
  }

  // 3. Contratos de soporte ————————————————————————————————————————————
  // Se borran antes horas/períodos/facturas de corridas anteriores — puede haber cambiado el mes.
  await db.delete(hourEntries).where(inArray(hourEntries.projectId, projectIds));
  await db.delete(supportInvoices).where(inArray(supportInvoices.planId, planIds));
  await db.delete(supportMonthlyPeriods).where(inArray(supportMonthlyPeriods.planId, planIds));

  const basePlan = {
    clientId: CLIENT_ID,
    scope: 'single' as const,
    status: 'active' as const,
    currency: 'UF' as const,
    leaderUserId: REAL.userJoseAponte,
    targetHoursCritical: '4',
    targetHoursHigh: '8',
    targetHoursMedium: '24',
    targetHoursLow: '48',
  };

  const plans: (Omit<typeof supportPlans.$inferInsert, 'slug'> & { id: string; name: string })[] = [
    {
      ...basePlan,
      id: IDS.onDemandToInvoice.plan,
      name: 'A demanda · Por facturar',
      planType: 'on_demand',
      startDate: monthStart(-6),
      planValueUf: '0.86',
      extraHourValueUf: '0.86',
    },
    {
      ...basePlan,
      id: IDS.onDemandInvoicedPending.plan,
      name: 'A demanda · Facturado · Pago pendiente',
      planType: 'on_demand',
      startDate: monthStart(-6),
      planValueUf: '0.86',
      extraHourValueUf: '0.86',
    },
    {
      ...basePlan,
      id: IDS.bundleDeviatedToInvoice.plan,
      name: 'Bolsa · Horas desviadas · Sin facturar',
      planType: 'bundle',
      startDate: monthStart(-3),
      endDate: monthStart(9),
      contractedHours: '40',
      planValueUf: '32',
      extraHourValueUf: '1.2',
    },
    {
      ...basePlan,
      id: IDS.bundleWithinQuota.plan,
      name: 'Bolsa · Dentro de la bolsa',
      planType: 'bundle',
      startDate: monthStart(-3),
      endDate: monthStart(9),
      contractedHours: '40',
      planValueUf: '32',
      extraHourValueUf: '1.2',
    },
    {
      ...basePlan,
      id: IDS.bundleInvoicedPaid.plan,
      name: 'Bolsa · Horas desviadas · Facturado · Pagado',
      planType: 'bundle',
      startDate: monthStart(-4),
      endDate: monthStart(8),
      contractedHours: '20',
      planValueUf: '16',
      extraHourValueUf: '1.2',
    },
    {
      ...basePlan,
      id: IDS.monthlyAccumulateToInvoice.plan,
      name: 'Mensual acumulable · Por facturar',
      planType: 'monthly',
      surplusPolicy: 'accumulate',
      startDate: monthStart(-2),
      endDate: monthStart(10),
      contractedHours: '10',
      planValueUf: '8',
      extraHourValueUf: '1.1',
    },
    {
      ...basePlan,
      id: IDS.monthlyAccumulateOverdue.plan,
      name: 'Mensual acumulable · Facturado · Atrasado',
      planType: 'monthly',
      surplusPolicy: 'accumulate',
      startDate: monthStart(-2),
      endDate: monthStart(10),
      contractedHours: '15',
      planValueUf: '12',
      extraHourValueUf: '1.1',
    },
    {
      ...basePlan,
      id: IDS.monthlyExpirePaid.plan,
      name: 'Mensual con vencimiento · Facturado · Pagado',
      planType: 'monthly',
      surplusPolicy: 'expire',
      dueDayOfMonth: 30,
      startDate: monthStart(-2),
      endDate: monthStart(10),
      contractedHours: '10',
      planValueUf: '8',
      extraHourValueUf: '1.1',
    },
    {
      ...basePlan,
      id: IDS.monthlyExpireLastPeriodOverage.plan,
      name: 'Mensual con vencimiento · Último período con exceso',
      planType: 'monthly',
      surplusPolicy: 'expire',
      dueDayOfMonth: 30,
      startDate: monthStart(-2),
      // Termina justo con el período en curso → es el último, y su exceso se cobra como horas extra.
      endDate: monthStart(1),
      contractedHours: '10',
      planValueUf: '6',
      extraHourValueUf: '1.1',
    },
  ];

  for (const plan of plans) {
    const slug = slugify(`demo ${plan.name}`);
    const { id: _id, ...updatable } = plan;
    await db
      .insert(supportPlans)
      .values({ ...plan, slug })
      .onConflictDoUpdate({ target: supportPlans.id, set: { ...updatable, surplusPolicy: plan.surplusPolicy ?? null, endDate: plan.endDate ?? null } });
  }

  await db.delete(supportPlanProjects).where(inArray(supportPlanProjects.planId, planIds));
  await db.insert(supportPlanProjects).values(Object.values(IDS).map((ids) => ({ planId: ids.plan, developmentProjectId: ids.project })));

  // 4. Horas aprobadas (a demanda / bolsa calculan en vivo a partir de ellas) ——
  const entry = (variant: Variant, offset: number, day: number, hours: number, description: string, userId: string = REAL.userEduardoAranda) => ({
    userId,
    projectId: IDS[variant].project,
    category: 'Soporte',
    description,
    hours: String(hours),
    date: monthDay(offset, day),
    status: 'approved' as const,
    decisionUserId: REAL.userJoseAponte,
    decisionAt: monthDay(offset, day),
  });

  await db.insert(hourEntries).values([
    // A demanda · Por facturar — 6.5 h aprobadas este mes → 6.5 × 0.86 = 5.59 UF. Las del mes pasado no cuentan.
    entry('onDemandToInvoice', -1, 18, 4, 'Ajuste de reporte mensual (mes anterior, ya fuera del ciclo).'),
    entry('onDemandToInvoice', 0, 3, 2.5, 'Corrección de error en formulario de contacto.'),
    entry('onDemandToInvoice', 0, 10, 4, 'Soporte a carga masiva de clientes.', REAL.userSolmaryCastro),
    // Una hora PENDIENTE de aprobación — no debe sumar al monto.
    { ...entry('onDemandToInvoice', 0, 12, 3, 'Revisión de logs (pendiente de aprobación).'), status: 'pending' as const, decisionUserId: null, decisionAt: null },

    // A demanda · Facturado — 12 h este mes, factura congelada en 10.32 UF.
    entry('onDemandInvoicedPending', 0, 2, 5, 'Incidente en sincronización de pedidos.'),
    entry('onDemandInvoicedPending', 0, 6, 7, 'Mejora de tiempos de carga en catálogo.', REAL.userSolmaryCastro),

    // Bolsa · Horas desviadas · Sin facturar — 40 h contratadas, 52.5 h usadas → 12.5 h × 1.2 = 15 UF. Alerta "horas desviadas".
    entry('bundleDeviatedToInvoice', -3, 12, 14, 'Soporte post salida a producción.'),
    entry('bundleDeviatedToInvoice', -2, 8, 12, 'Ajustes de reglas de reposición.', REAL.userSolmaryCastro),
    entry('bundleDeviatedToInvoice', -1, 15, 16, 'Integración con transportista nuevo.'),
    entry('bundleDeviatedToInvoice', 0, 4, 6, 'Corrección de stock negativo en bodega central.'),
    entry('bundleDeviatedToInvoice', 0, 9, 4.5, 'Soporte a inventario de cierre de mes.', REAL.userSolmaryCastro),

    // Bolsa · Dentro de la bolsa — 22 de 40 h → sin excedente, "Sin movimiento" y sin alerta.
    entry('bundleWithinQuota', -2, 10, 8, 'Alta de nuevos perfiles de usuario.'),
    entry('bundleWithinQuota', -1, 14, 9, 'Ajuste de flujo de vacaciones.'),
    entry('bundleWithinQuota', 0, 5, 5, 'Corrección de liquidación en PDF.', REAL.userSolmaryCastro),

    // Bolsa · Facturado · Pagado — 20 h contratadas, 30 h usadas; el excedente completo (10 h) se facturó este mes,
    // así que el cálculo en vivo da 0 y la fila igual debe verse "Facturado" (no "Sin movimiento").
    entry('bundleInvoicedPaid', -3, 10, 12, 'Configuración inicial del bot.'),
    entry('bundleInvoicedPaid', -2, 12, 10, 'Ajuste de plantillas de correo de cobranza.'),
    entry('bundleInvoicedPaid', -1, 20, 6, 'Nuevo tramo de mora en reglas del bot.'),
    entry('bundleInvoicedPaid', 0, 3, 2, 'Soporte a campaña de cobranza.', REAL.userSolmaryCastro),

    // Mensuales — el consumo del período vigente se recalcula con estas horas (`SupportMonthlyPeriodReconciler`),
    // así que deben sumar lo mismo que `consumed` en el período de este mes (paso 5).
    entry('monthlyAccumulateToInvoice', 0, 2, 4, 'Ajuste de integración con SII.'),
    entry('monthlyAccumulateToInvoice', 0, 8, 2, 'Soporte a cierre contable.', REAL.userSolmaryCastro),
    entry('monthlyAccumulateOverdue', 0, 3, 5, 'Corrección de cálculo de despacho.'),
    entry('monthlyAccumulateOverdue', 0, 9, 3, 'Soporte a campaña de descuentos.', REAL.userSolmaryCastro),
    entry('monthlyExpirePaid', 0, 4, 5, 'Nuevo indicador de ventas por zona.'),
    entry('monthlyExpireLastPeriodOverage', 0, 2, 8, 'Sincronización offline de visitas.'),
    entry('monthlyExpireLastPeriodOverage', 0, 7, 6, 'Corrección de geolocalización en Android.', REAL.userSolmaryCastro),
  ]);

  // 5. Períodos mensuales — los cerrados guardan su consumo tal cual; el de este mes debe calzar con las horas del paso 4 ——
  const periods = (
    variant: Variant,
    surplusPolicy: 'accumulate' | 'expire',
    contracted: number,
    rows: { offset: number; reused: number; consumed: number }[],
  ) =>
    rows.map((row) => ({
      planId: IDS[variant].plan,
      startDate: monthStart(row.offset),
      endDate: monthStart(row.offset + 1),
      surplusPolicy,
      contractedHours: String(contracted),
      reusedBalanceHours: String(row.reused),
      consumedHoursPeriod: String(row.consumed),
      surplusHours: String(Math.max(0, contracted + (surplusPolicy === 'accumulate' ? row.reused : 0) - row.consumed)),
      status: row.offset === 0 ? ('active' as const) : ('closed' as const),
    }));

  const insertedPeriods = await db
    .insert(supportMonthlyPeriods)
    .values([
      ...periods('monthlyAccumulateToInvoice', 'accumulate', 10, [
        { offset: -2, reused: 0, consumed: 7 },
        { offset: -1, reused: 3, consumed: 9 },
        { offset: 0, reused: 4, consumed: 6 },
      ]),
      ...periods('monthlyAccumulateOverdue', 'accumulate', 15, [
        { offset: -2, reused: 0, consumed: 10 },
        { offset: -1, reused: 5, consumed: 14 },
        { offset: 0, reused: 6, consumed: 8 },
      ]),
      ...periods('monthlyExpirePaid', 'expire', 10, [
        { offset: -2, reused: 0, consumed: 10 },
        { offset: -1, reused: 0, consumed: 8 },
        { offset: 0, reused: 0, consumed: 5 },
      ]),
      // Último período con 14 h de 10 → 6 UF + 4 h × 1.1 = 10.40 UF. Alerta "exceso en el último período".
      ...periods('monthlyExpireLastPeriodOverage', 'expire', 10, [
        { offset: -2, reused: 0, consumed: 9 },
        { offset: -1, reused: 0, consumed: 10 },
        { offset: 0, reused: 0, consumed: 14 },
      ]),
    ])
    .returning({ id: supportMonthlyPeriods.id, planId: supportMonthlyPeriods.planId, startDate: supportMonthlyPeriods.startDate });

  const periodIdOf = (variant: Variant, offset: number) =>
    insertedPeriods.find((p) => p.planId === IDS[variant].plan && p.startDate.getTime() === monthStart(offset).getTime())?.id ?? null;

  // 6. Facturas ————————————————————————————————————————————————————————
  await db.insert(supportInvoices).values([
    // A demanda · Facturado · Pago pendiente — vence en 30 días.
    {
      planId: IDS.onDemandInvoicedPending.plan,
      periodKey: currentPeriodKey,
      amountUf: '10.32',
      currency: 'UF',
      hoursBilled: '12',
      folio: 'DEMO-1002',
      invoicedAt: monthDay(0, 7),
      dueAt: addDays(monthDay(0, 7), 30),
    },
    // Bolsa · Facturado · Pagado — 10 h de excedente × 1.2 = 12.00 UF.
    {
      planId: IDS.bundleInvoicedPaid.plan,
      periodKey: currentPeriodKey,
      amountUf: '12',
      currency: 'UF',
      hoursBilled: '10',
      folio: 'DEMO-1005',
      invoicedAt: monthDay(0, 5),
      dueAt: addDays(monthDay(0, 5), 30),
      paidAt: monthDay(0, 12),
    },
    // Mensual acumulable · Atrasado — la del mes anterior sigue impaga y vencida (alerta roja + KPI "Pagos atrasados")…
    {
      planId: IDS.monthlyAccumulateOverdue.plan,
      periodKey: previousPeriodKey,
      amountUf: '12',
      currency: 'UF',
      folio: 'DEMO-1006',
      invoicedAt: monthDay(-1, 1),
      dueAt: monthDay(-1, 15),
      monthlyPeriodId: periodIdOf('monthlyAccumulateOverdue', -1),
    },
    // …y la de este mes también ya venció (ayer).
    {
      planId: IDS.monthlyAccumulateOverdue.plan,
      periodKey: currentPeriodKey,
      amountUf: '12',
      currency: 'UF',
      folio: 'DEMO-1007',
      invoicedAt: monthDay(0, 1),
      dueAt: yesterday,
      monthlyPeriodId: periodIdOf('monthlyAccumulateOverdue', 0),
    },
    // Mensual con vencimiento · Pagado — historial pagado del mes anterior + la de este mes pagada.
    {
      planId: IDS.monthlyExpirePaid.plan,
      periodKey: previousPeriodKey,
      amountUf: '8',
      currency: 'UF',
      folio: 'DEMO-1008',
      invoicedAt: monthDay(-1, 1),
      dueAt: monthDay(-1, 30),
      paidAt: monthDay(-1, 10),
      monthlyPeriodId: periodIdOf('monthlyExpirePaid', -1),
    },
    {
      planId: IDS.monthlyExpirePaid.plan,
      periodKey: currentPeriodKey,
      amountUf: '8',
      currency: 'UF',
      folio: 'DEMO-1009',
      invoicedAt: monthDay(0, 1),
      dueAt: addDays(monthDay(0, 1), 30),
      paidAt: monthDay(0, 5),
      monthlyPeriodId: periodIdOf('monthlyExpirePaid', 0),
    },
  ]);

  return { period: currentPeriodKey, plansSeeded: plans.length };
}
