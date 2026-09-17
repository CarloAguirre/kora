import { eq } from 'drizzle-orm';
import type { Database } from '../client';
import {
  clientContacts,
  hourEntries,
  projectModuleDeliveries,
  projectModules,
  projectModuleSegments,
  projectModuleTasks,
  projectObservations,
  projectPaymentMilestones,
  projects,
  supportInvoices,
  supportPlanProjects,
  supportPlans,
  ticketHistoryEntries,
  tickets,
} from '../schema';

/**
 * Siembra el proyecto demo del portal de cliente (ver docs/DECISION-PORTAL-CLIENTE.md).
 *
 * A diferencia de `seedAccessCatalog`, esto NO es seguro de correr en
 * cualquier ambiente: crea datos de negocio de ejemplo. Se corre a mano con
 * `pnpm --filter @kora/db seed:demo`, nunca como parte de un despliegue.
 *
 * Reutiliza entidades REALES ya migradas de la v1 en vez de duplicarlas: el
 * cliente "Edificate Inteligente", su contacto José Miguel Rodriguez, los
 * equipos DEV/QA/IA/UX/RPA y el staff de Kabeli (Ana María Soto Lobos, José
 * Aponte, Eduardo Aranda, Solmary Castro) ya existen en la base local con
 * ETL corrido — este seed solo AGREGA filas nuevas (un contacto, proyectos,
 * fases, tareas, tickets, contratos de soporte), nunca modifica las
 * existentes. Es idempotente: usa ids fijos y upsert/reemplazo por padre,
 * así que correrlo dos veces no duplica nada.
 *
 * Las fechas replican exactamente `mocks/client-portal.mocks.ts` — se
 * mantienen así a propósito: hoy (16-09-2026) cae en medio del rango de esas
 * fechas, así que los estados derivados (fase en curso/finalizada, entrega
 * atrasada/comprometida) que hoy calcula el frontend a partir de fechas
 * reales coinciden con lo que el mock mostraba como valores fijos.
 */

// IDs reales, ya existentes en la base (ETL desde la v1) — NO se crean aquí.
const REAL = {
  clientId: '8b7b1997-addf-42e5-8210-6e7dae48150f', // Edificate Inteligente
  contactJoseMiguel: '92734db0-98e8-42d3-a540-f2902709edbd', // José Miguel Rodriguez
  teamQa: 'd9ddcdf5-a621-4a81-8aa3-97856800f435',
  teamDev: '91d19384-334b-4cc8-a776-c5a59036316f', // "Desarrollo"
  teamRpa: '50a796e3-3382-4c4e-baa1-11b2430df60d',
  teamIa: '7e96e0a9-86bb-44a9-96f2-46e3660e7ce4',
  teamUx: '7eb21db7-cf7a-472b-9e14-569f286417a1', // "UX-UI"
  userAnaSoto: '89cdcf98-2801-4e29-b181-db3ca22e71c7',
  userJoseAponte: '5edce9f8-b995-43be-86c4-702aa929c2ee',
  userEduardoAranda: '064969c7-c586-4261-a7e6-255669ab4237',
  userSolmaryCastro: 'ea6d5a9b-e3bb-47f7-a064-60ac27a593fb',
} as const;

// IDs nuevos, fijos para que el seed sea idempotente (upsert por id).
const DEMO = {
  contactCamila: 'c0ffee00-0000-4000-8000-000000000001',

  projectMain: 'de000000-0000-4000-8000-000000000001',
  moduleFase1: 'de000000-0000-4000-8000-000000000011',
  moduleFase2: 'de000000-0000-4000-8000-000000000012',
  moduleFase3: 'de000000-0000-4000-8000-000000000013',
  moduleFase4: 'de000000-0000-4000-8000-000000000014',

  projectAppResidentes: 'de000000-0000-4000-8000-000000000002',
  projectSistemaGestion: 'de000000-0000-4000-8000-000000000003',
  projectPortalProveedores: 'de000000-0000-4000-8000-000000000004',
  projectAppMobileResidentes: 'de000000-0000-4000-8000-000000000005',

  supportPlanSingle: 'de000000-0000-4000-8000-000000000021',
  supportPlanConsolidated: 'de000000-0000-4000-8000-000000000022',

  invoiceIn0024: 'de000000-0000-4000-8000-000000000031',

  ticketIn0047: 'de000000-0000-4000-8000-000000000041',
  ticketIn0024: 'de000000-0000-4000-8000-000000000042',
  ticketIn0019: 'de000000-0000-4000-8000-000000000043',
  ticketIn0011: 'de000000-0000-4000-8000-000000000044',
  ticketMe0007: 'de000000-0000-4000-8000-000000000045',
  ticketIn0009: 'de000000-0000-4000-8000-000000000046',
  ticketSistemaGestion1: 'de000000-0000-4000-8000-000000000047',
  ticketSistemaGestion2: 'de000000-0000-4000-8000-000000000048',
} as const;

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export interface SeedDemoClientPortalResult {
  projectsCreated: number;
  ticketsCreated: number;
}

export async function seedDemoClientPortal(db: Database): Promise<SeedDemoClientPortalResult> {
  // 1. Contacto adicional del cliente (Camila Reyes, Gerente de Operaciones) ——
  await db
    .insert(clientContacts)
    .values({
      id: DEMO.contactCamila,
      clientId: REAL.clientId,
      name: 'Camila Reyes',
      position: 'Gerente de Operaciones',
      email: 'camila.reyes@edificateinteligente.cl',
    })
    .onConflictDoUpdate({
      target: clientContacts.id,
      set: { name: 'Camila Reyes', position: 'Gerente de Operaciones', email: 'camila.reyes@edificateinteligente.cl' },
    });

  // 2. Proyecto principal — "Portal de Gestión Financiera + Agente IA de Tickets" ——
  await db
    .insert(projects)
    .values({
      id: DEMO.projectMain,
      name: 'Portal de Gestión Financiera + Agente IA de Tickets',
      clientId: REAL.clientId,
      primaryContactId: REAL.contactJoseMiguel,
      type: 'development',
      salesStage: 'approved',
      status: 'active',
      phase: 'development',
      priority: 'high',
      leaderUserId: REAL.userAnaSoto,
      startDate: d('2026-04-01'),
      endDate: d('2026-09-30'),
      estimatedDeliveryDate: d('2026-09-30'),
      soldHours: '2489',
      usedHours: '2826.2',
      expectedProgress: 77,
      actualProgress: 41,
      demoLink: 'https://demo.kabeli.cl/portal-financiero',
      testEnvironmentLink: 'https://staging.kabeli.cl/portal-financiero',
      figmaLink: 'https://www.figma.com/design/Sqc5DJtmbLtnBhAM0y4Fww/Kora',
      documentationLink: 'https://docs.kabeli.cl/portal-financiero',
      impactBeforeHours: '72',
      impactBeforePeople: '3 personas',
      impactBeforeDuration: '3 días laborales (8h c/u)',
      impactBeforeModality: '100% manual',
      impactAfterHours: '6.5',
      impactAfterPeople: '0 personas · solo supervisión',
      impactAfterDuration: 'Mismo día',
      impactAfterModality: 'Automatizado',
      qaTestingStartDate: d('2026-07-30'),
      qaTestingEndDate: d('2026-07-30'),
      qaEvaluatedModule: 'Módulo de tickets',
      qaPlannedTests: 300,
      qaExecutedTests: 200,
      qaFailedTests: 20,
      periodReportDate: d('2026-07-22'),
      periodReportAchievements: [
        'Se completó el módulo de autenticación y login, incluyendo funcionalidades clave.',
        'Despliegue continuo de código (backend y frontend) habilitado en ambiente de pruebas.',
        'Se integró el agente IA para clasificación y respuesta de tickets.',
        'Se corrigieron wireframes de los módulos 6 y 7 según feedback de la última revisión.',
      ],
    })
    .onConflictDoUpdate({
      target: projects.id,
      set: {
        status: 'active',
        soldHours: '2489',
        usedHours: '2826.2',
        expectedProgress: 77,
        actualProgress: 41,
      },
    });

  // 3. Tramos de pago ("Facturación") — se reemplazan por completo en cada corrida.
  await db.delete(projectPaymentMilestones).where(eq(projectPaymentMilestones.projectId, DEMO.projectMain));
  await db.insert(projectPaymentMilestones).values([
    {
      projectId: DEMO.projectMain,
      name: 'Inicio',
      percent: '50',
      amount: '12500000',
      invoiceNumber: 'F-4521',
      issuedAt: d('2026-04-05'),
      status: 'paid',
      paidAt: d('2026-04-10'),
      sortOrder: 1,
    },
    {
      projectId: DEMO.projectMain,
      name: 'Marcha blanca',
      percent: '50',
      amount: '12500000',
      status: 'pending',
      sortOrder: 2,
    },
  ]);

  // 4. Fases (módulos) + su Gantt (tramos, tareas, entregas) ——————————————
  await db.delete(projectModules).where(eq(projectModules.projectId, DEMO.projectMain));
  await db.insert(projectModules).values([
    {
      id: DEMO.moduleFase1,
      projectId: DEMO.projectMain,
      name: 'Módulo Financiero',
      initialStage: 'discovery',
      currentStage: 'closed',
      estimatedStartDate: d('2026-06-02'),
      estimatedEndDate: d('2026-07-18'),
    },
    {
      id: DEMO.moduleFase2,
      projectId: DEMO.projectMain,
      name: 'Tickets con Agente IA',
      initialStage: 'discovery',
      currentStage: 'development',
      estimatedStartDate: d('2026-07-18'),
      estimatedEndDate: d('2026-09-20'),
    },
    {
      id: DEMO.moduleFase3,
      projectId: DEMO.projectMain,
      name: 'Reportería y Dashboards',
      initialStage: 'discovery',
      currentStage: 'production',
      estimatedStartDate: d('2026-07-20'),
      estimatedEndDate: d('2026-09-05'),
    },
    {
      id: DEMO.moduleFase4,
      projectId: DEMO.projectMain,
      name: 'Automatizaciones RPA',
      initialStage: 'discovery',
      currentStage: 'discovery',
      estimatedStartDate: d('2026-09-15'),
      estimatedEndDate: d('2026-10-15'),
    },
  ]);

  // Tramos ("Roadmap por Fases" del portal) — 10 en total, uno por barra del Gantt.
  await db.insert(projectModuleSegments).values([
    { moduleId: DEMO.moduleFase1, teamId: REAL.teamDev, name: 'Diseño y levantamiento', startDate: d('2026-06-02'), endDate: d('2026-06-20') },
    { moduleId: DEMO.moduleFase1, teamId: REAL.teamDev, name: 'Desarrollo backend + frontend', startDate: d('2026-06-20'), endDate: d('2026-07-10') },
    { moduleId: DEMO.moduleFase1, teamId: REAL.teamQa, name: 'QA funcional', startDate: d('2026-07-10'), endDate: d('2026-07-18') },
    { moduleId: DEMO.moduleFase2, teamId: REAL.teamIa, name: 'Diseño del agente', startDate: d('2026-07-18'), endDate: d('2026-08-05') },
    { moduleId: DEMO.moduleFase2, teamId: REAL.teamIa, name: 'Desarrollo del agente', startDate: d('2026-08-05'), endDate: d('2026-09-10') },
    { moduleId: DEMO.moduleFase2, teamId: REAL.teamQa, name: 'QA funcional', startDate: d('2026-09-10'), endDate: d('2026-09-20') },
    { moduleId: DEMO.moduleFase3, teamId: REAL.teamUx, name: 'Diseño de dashboards', startDate: d('2026-07-20'), endDate: d('2026-08-05') },
    { moduleId: DEMO.moduleFase3, teamId: REAL.teamDev, name: 'Desarrollo frontend', startDate: d('2026-08-05'), endDate: d('2026-09-05') },
    { moduleId: DEMO.moduleFase4, teamId: REAL.teamRpa, name: 'Diseño de flujos', startDate: d('2026-09-15'), endDate: d('2026-09-25') },
    { moduleId: DEMO.moduleFase4, teamId: REAL.teamRpa, name: 'Desarrollo de bots', startDate: d('2026-09-25'), endDate: d('2026-10-15') },
  ]);

  // Tareas puntuales (marcador "Tareas" del Roadmap) — el estado real (done/todo)
  // combinado con la fecha es lo que el frontend usa para derivar "terminada/próxima/atrasada".
  await db.insert(projectModuleTasks).values([
    { moduleId: DEMO.moduleFase1, teamId: REAL.teamDev, name: 'Definir criterios de conciliación', date: d('2026-06-15'), status: 'done', scope: 'diseno' },
    { moduleId: DEMO.moduleFase1, teamId: REAL.teamQa, name: 'Casos de prueba conciliación', date: d('2026-07-12'), status: 'done', scope: 'qa' },
    { moduleId: DEMO.moduleFase2, teamId: REAL.teamIa, name: 'Definir intents principales', date: d('2026-07-25'), status: 'done', scope: 'diseno' },
    { moduleId: DEMO.moduleFase2, teamId: REAL.teamIa, name: 'Conectar a mesa de ayuda', date: d('2026-08-10'), status: 'in_progress', scope: 'desarrollo' },
    { moduleId: DEMO.moduleFase2, teamId: REAL.teamIa, name: 'Entrenar modelo con casos reales', date: d('2026-08-20'), status: 'todo', scope: 'desarrollo' },
    { moduleId: DEMO.moduleFase3, teamId: REAL.teamUx, name: 'Wireframes de reportes', date: d('2026-07-28'), status: 'done', scope: 'diseno' },
    { moduleId: DEMO.moduleFase3, teamId: REAL.teamDev, name: 'Gráficos de avance por equipo', date: d('2026-08-25'), status: 'in_progress', scope: 'desarrollo' },
  ]);

  // Entregas — 1 por fase, 4 en total.
  await db.insert(projectModuleDeliveries).values([
    { moduleId: DEMO.moduleFase1, teamId: REAL.teamDev, estimatedDate: d('2026-07-15'), status: 'delivered' },
    { moduleId: DEMO.moduleFase2, teamId: REAL.teamIa, estimatedDate: d('2026-08-25'), status: 'planned' },
    { moduleId: DEMO.moduleFase3, teamId: REAL.teamDev, estimatedDate: d('2026-08-30'), status: 'planned' },
    { moduleId: DEMO.moduleFase4, teamId: REAL.teamRpa, estimatedDate: d('2026-10-10'), status: 'planned' },
  ]);

  // 5. Horas — sustentan `usedHours`, la fecha "actualizado al" y los 2 badges
  //    "⚑ incidente" (Fase 1 y Fase 2) que el Roadmap deriva de `has_blocker`.
  await db.delete(hourEntries).where(eq(hourEntries.projectId, DEMO.projectMain));
  await db.insert(hourEntries).values([
    {
      userId: REAL.userAnaSoto,
      projectId: DEMO.projectMain,
      moduleId: DEMO.moduleFase2,
      category: 'Desarrollo',
      description: 'Avance del agente IA de tickets.',
      hours: '6',
      date: d('2026-07-22'),
      status: 'approved',
    },
    {
      userId: REAL.userEduardoAranda,
      projectId: DEMO.projectMain,
      moduleId: DEMO.moduleFase1,
      category: 'Bloqueo',
      description: 'Seguimiento de bloqueo con el cliente.',
      hasBlocker: true,
      blockerDescription: 'Cliente no ha confirmado los criterios de conciliación bancaria.',
      hours: '1',
      date: d('2026-08-28'),
      status: 'approved',
    },
    {
      userId: REAL.userSolmaryCastro,
      projectId: DEMO.projectMain,
      moduleId: DEMO.moduleFase2,
      category: 'Bloqueo',
      description: 'Dependencia externa de mesa de ayuda.',
      hasBlocker: true,
      blockerDescription: 'Bloqueo temporal por dependencia externa en la integración con la mesa de ayuda.',
      hours: '1',
      date: d('2026-08-10'),
      status: 'approved',
    },
  ]);

  // 6. Bitácora — feed cronológico + la entrada relacionada a la Fase 1.
  await db.delete(projectObservations).where(eq(projectObservations.projectId, DEMO.projectMain));
  await db.insert(projectObservations).values([
    {
      projectId: DEMO.projectMain,
      moduleId: DEMO.moduleFase1,
      type: 'compromiso',
      title: 'Tarea completada: Casos de prueba conciliación',
      message: 'Casos de prueba de conciliación bancaria completados y listos para QA.',
      status: 'cumplido',
      date: d('2026-07-12'),
      authorUserId: REAL.userSolmaryCastro,
    },
    {
      projectId: DEMO.projectMain,
      moduleId: DEMO.moduleFase1,
      type: 'compromiso',
      title: 'Diseño UX/UI entregado',
      message: 'Seguimiento general del proyecto, sin bloqueos. Aprobado por Camila Reyes el 15-06-2026 09:15.',
      status: 'cumplido',
      date: d('2026-09-02'),
      authorUserId: REAL.userEduardoAranda,
    },
    {
      projectId: DEMO.projectMain,
      moduleId: DEMO.moduleFase3,
      type: 'hito',
      title: 'Dashboard ejecutivo marcado como entregado',
      message: 'El líder de equipo DEV marcó esta entrega como completada, pendiente de revisión.',
      status: 'pendiente',
      date: d('2026-08-30'),
      authorUserId: REAL.userEduardoAranda,
    },
    {
      projectId: DEMO.projectMain,
      moduleId: DEMO.moduleFase1,
      type: 'atencion',
      title: 'Espera de feedback cliente',
      message: 'Cliente no ha confirmado los criterios de conciliación bancaria.',
      status: 'abierto',
      date: d('2026-08-28'),
      authorUserId: REAL.userJoseAponte,
    },
    {
      projectId: DEMO.projectMain,
      moduleId: DEMO.moduleFase1,
      type: 'hito',
      title: 'Kickoff de Módulo Financiero',
      message: 'Reunión de inicio con Edificate Inteligente, alcance confirmado.',
      status: 'activo',
      date: d('2026-08-27'),
      authorUserId: REAL.userJoseAponte,
    },
    {
      projectId: DEMO.projectMain,
      moduleId: DEMO.moduleFase1,
      type: 'compromiso',
      title: 'Cliente enviará excel de cuentas contables',
      message: 'Cliente quedó de enviar el Excel con el catastro de cuentas contables el día martes AM.',
      status: 'pendiente',
      date: d('2026-08-26'),
      authorUserId: REAL.userJoseAponte,
    },
    {
      projectId: DEMO.projectMain,
      moduleId: DEMO.moduleFase1,
      type: 'compromiso',
      title: 'Reunión de validación agendada con el equipo financiero del cliente',
      message: 'Se requiere validación del cliente sobre el flujo de aprobación de presupuestos (módulo 5).',
      status: 'pendiente',
      date: d('2026-08-26'),
      authorUserId: REAL.userAnaSoto,
    },
  ]);

  // 7. Proyectos de desarrollo cubiertos por los contratos de soporte —————
  const supportProjectRows = [
    { id: DEMO.projectAppResidentes, name: 'App Mobile Residentes con asistente IA' },
    { id: DEMO.projectSistemaGestion, name: 'Sistema de Gestión' },
    { id: DEMO.projectPortalProveedores, name: 'Portal de Proveedores' },
    { id: DEMO.projectAppMobileResidentes, name: 'App Mobile Residentes' },
  ];
  for (const row of supportProjectRows) {
    await db
      .insert(projects)
      .values({
        id: row.id,
        name: row.name,
        clientId: REAL.clientId,
        primaryContactId: REAL.contactJoseMiguel,
        type: 'development',
        status: 'finished',
        phase: 'closed',
        leaderUserId: REAL.userJoseAponte,
      })
      .onConflictDoUpdate({ target: projects.id, set: { status: 'finished' } });
  }

  // 8. Contrato de soporte ÚNICO — "App Residentes" (Figma node 9007:8445) ——
  await db
    .insert(supportPlans)
    .values({
      id: DEMO.supportPlanSingle,
      clientId: REAL.clientId,
      scope: 'single',
      planType: 'bundle',
      name: 'App Residentes',
      leaderUserId: REAL.userJoseAponte,
      startDate: d('2026-08-20'),
      endDate: d('2026-11-20'),
      contractedHours: '150',
      planValueUf: '0.6',
      extraHourValueUf: '0.86',
    })
    .onConflictDoUpdate({
      target: supportPlans.id,
      set: { contractedHours: '150', planValueUf: '0.6', extraHourValueUf: '0.86' },
    });
  await db.delete(supportPlanProjects).where(eq(supportPlanProjects.planId, DEMO.supportPlanSingle));
  await db.insert(supportPlanProjects).values([{ planId: DEMO.supportPlanSingle, developmentProjectId: DEMO.projectAppResidentes }]);

  // 9. Contrato de soporte CONSOLIDADO — "Consolidado Edifícate" (Figma node 9007:8170) ——
  await db
    .insert(supportPlans)
    .values({
      id: DEMO.supportPlanConsolidated,
      clientId: REAL.clientId,
      scope: 'consolidated',
      planType: 'on_demand',
      name: 'Consolidado Edifícate',
      leaderUserId: REAL.userJoseAponte,
      startDate: d('2026-04-01'),
      extraHourValueUf: '0.86',
    })
    .onConflictDoUpdate({ target: supportPlans.id, set: { extraHourValueUf: '0.86' } });
  await db.delete(supportPlanProjects).where(eq(supportPlanProjects.planId, DEMO.supportPlanConsolidated));
  await db.insert(supportPlanProjects).values([
    { planId: DEMO.supportPlanConsolidated, developmentProjectId: DEMO.projectSistemaGestion },
    { planId: DEMO.supportPlanConsolidated, developmentProjectId: DEMO.projectPortalProveedores },
    { planId: DEMO.supportPlanConsolidated, developmentProjectId: DEMO.projectAppMobileResidentes },
  ]);

  // 10. Factura de soporte — deja IN0024 como "Facturada" ————————————————
  await db
    .insert(supportInvoices)
    .values({
      id: DEMO.invoiceIn0024,
      planId: DEMO.supportPlanSingle,
      periodKey: '2025-11',
      amountUf: '10.32',
      currency: 'UF',
      hoursBilled: '17.2',
      folio: 'F-9284',
      invoicedAt: d('2025-11-10'),
      dueAt: d('2025-12-10'),
    })
    .onConflictDoUpdate({ target: supportInvoices.id, set: { amountUf: '10.32', hoursBilled: '17.2' } });

  // 11. Tickets del contrato "App Residentes" — 6 ejemplos completos, con historial.
  const appResidentesTickets = [
    {
      id: DEMO.ticketIn0047,
      legacyId: '0047',
      clientId: REAL.clientId,
      developmentProjectId: DEMO.projectAppResidentes,
      title: 'Error log in',
      serviceType: 'incident' as const,
      description: 'Los usuarios no pueden iniciar sesión desde la app móvil; el botón "Ingresar" queda cargando indefinidamente.',
      evidenceUrl: 'Captura1.jpg',
      assigneeUserId: REAL.userEduardoAranda,
      priority: 'medium' as const,
      estimatedHours: 4,
      usedHours: '1.5',
      status: 'in_progress' as const,
      createdAt: d('2025-11-08'),
    },
    {
      id: DEMO.ticketIn0024,
      legacyId: '0024',
      clientId: REAL.clientId,
      developmentProjectId: DEMO.projectAppResidentes,
      title: 'Error en conexión al servidor',
      serviceType: 'incident' as const,
      description: 'Al ingresar un nuevo reporte no deja guardarlo y no se ve el historial de los últimos días. Adjunto capturas del error como evidencia.',
      evidenceUrl: 'Captura1.jpg',
      assigneeUserId: REAL.userEduardoAranda,
      priority: 'medium' as const,
      estimatedHours: 8,
      usedHours: '6',
      status: 'closed' as const,
      resolvedAt: d('2025-11-10'),
      invoiceId: DEMO.invoiceIn0024,
      createdAt: d('2025-11-10'),
    },
    {
      id: DEMO.ticketIn0019,
      legacyId: '0019',
      clientId: REAL.clientId,
      developmentProjectId: DEMO.projectAppResidentes,
      title: 'Conexión base de datos',
      serviceType: 'incident' as const,
      description: 'La conexión a la base de datos se corta intermitentemente durante el horario de mayor uso, generando errores 500 en reportes.',
      assigneeUserId: REAL.userSolmaryCastro,
      priority: 'high' as const,
      estimatedHours: 6,
      usedHours: '5',
      status: 'closed' as const,
      resolution: 'Se ajustó el pool de conexiones y se agregó reintento automático.',
      resolvedAt: d('2025-11-06'),
      createdAt: d('2025-11-05'),
    },
    {
      id: DEMO.ticketIn0011,
      legacyId: '0011',
      clientId: REAL.clientId,
      developmentProjectId: DEMO.projectAppResidentes,
      title: 'Error usuario nuevo',
      serviceType: 'incident' as const,
      description: 'Al crear un usuario residente nuevo, la invitación por correo no se envía.',
      assigneeUserId: REAL.userSolmaryCastro,
      priority: 'low' as const,
      estimatedHours: 3,
      usedHours: '2',
      status: 'closed' as const,
      resolution: 'Se corrigió la plantilla de correo que fallaba con caracteres especiales en el nombre.',
      resolvedAt: d('2025-11-03'),
      createdAt: d('2025-11-02'),
    },
    {
      id: DEMO.ticketMe0007,
      legacyId: '0007',
      clientId: REAL.clientId,
      developmentProjectId: DEMO.projectAppResidentes,
      title: 'CSS tablas',
      serviceType: 'improvement' as const,
      description: 'Mejora visual solicitada: las tablas de reportes no se ajustan bien en pantallas angostas.',
      assigneeUserId: REAL.userEduardoAranda,
      priority: 'low' as const,
      estimatedHours: 5,
      usedHours: '2',
      status: 'in_progress' as const,
      createdAt: d('2025-11-09'),
    },
    {
      id: DEMO.ticketIn0009,
      legacyId: '0009',
      clientId: REAL.clientId,
      developmentProjectId: DEMO.projectAppResidentes,
      title: 'Error en CSS tablas',
      serviceType: 'incident' as const,
      description: 'Las columnas de la tabla de tickets se superponen en resolución de tablet.',
      assigneeUserId: REAL.userEduardoAranda,
      priority: 'low' as const,
      estimatedHours: 2,
      usedHours: '1.5',
      status: 'closed' as const,
      resolution: 'Se corrigió el breakpoint del componente de tabla.',
      resolvedAt: d('2025-11-01'),
      createdAt: d('2025-11-01'),
    },
  ];
  for (const ticket of appResidentesTickets) {
    const { id, ...rest } = ticket;
    await db.insert(tickets).values(ticket).onConflictDoUpdate({ target: tickets.id, set: rest });
    await db.delete(ticketHistoryEntries).where(eq(ticketHistoryEntries.ticketId, id));
  }

  await db.insert(ticketHistoryEntries).values([
    { ticketId: DEMO.ticketIn0047, eventType: 'created', description: 'Creación de ticket', occurredAt: d('2025-11-08') },
    { ticketId: DEMO.ticketIn0047, eventType: 'support_started', description: 'Eduardo Aranda inicia soporte.', occurredAt: d('2025-11-08') },

    { ticketId: DEMO.ticketIn0024, eventType: 'created', description: 'Creación de ticket', occurredAt: d('2025-11-10') },
    { ticketId: DEMO.ticketIn0024, eventType: 'support_started', description: 'Eduardo Aranda inicia soporte.', occurredAt: d('2025-11-10') },
    {
      ticketId: DEMO.ticketIn0024,
      eventType: 'update',
      description: 'Edición de ticket:',
      metadata: { details: ['Reasignado a Solmary Castro.', 'Cambio de prioridad: Alta'] },
      occurredAt: d('2025-11-10'),
    },
    { ticketId: DEMO.ticketIn0024, eventType: 'done', description: 'Ticket terminado', occurredAt: d('2025-11-10') },
    { ticketId: DEMO.ticketIn0024, eventType: 'closed', description: 'Ticket cerrado', occurredAt: d('2025-11-10') },

    { ticketId: DEMO.ticketIn0019, eventType: 'created', description: 'Creación de ticket', occurredAt: d('2025-11-05') },
    { ticketId: DEMO.ticketIn0019, eventType: 'done', description: 'Ticket terminado', occurredAt: d('2025-11-06') },
    { ticketId: DEMO.ticketIn0019, eventType: 'closed', description: 'Ticket cerrado', occurredAt: d('2025-11-06') },

    { ticketId: DEMO.ticketIn0011, eventType: 'created', description: 'Creación de ticket', occurredAt: d('2025-11-02') },
    { ticketId: DEMO.ticketIn0011, eventType: 'done', description: 'Ticket terminado', occurredAt: d('2025-11-03') },
    { ticketId: DEMO.ticketIn0011, eventType: 'closed', description: 'Ticket cerrado', occurredAt: d('2025-11-03') },

    { ticketId: DEMO.ticketMe0007, eventType: 'created', description: 'Creación de ticket', occurredAt: d('2025-11-09') },
    { ticketId: DEMO.ticketMe0007, eventType: 'support_started', description: 'Eduardo Aranda inicia soporte.', occurredAt: d('2025-11-09') },

    { ticketId: DEMO.ticketIn0009, eventType: 'created', description: 'Creación de ticket', occurredAt: d('2025-11-01') },
    { ticketId: DEMO.ticketIn0009, eventType: 'done', description: 'Ticket terminado', occurredAt: d('2025-11-01') },
    { ticketId: DEMO.ticketIn0009, eventType: 'closed', description: 'Ticket cerrado', occurredAt: d('2025-11-01') },
  ]);

  // 12. Un par de tickets simples en el consolidado (pestaña "Sistema de Gestión").
  const sistemaGestionTickets = [
    {
      id: DEMO.ticketSistemaGestion1,
      legacyId: '0031',
      clientId: REAL.clientId,
      developmentProjectId: DEMO.projectSistemaGestion,
      title: 'Reporte mensual no exporta a Excel',
      serviceType: 'bug' as const,
      description: 'El botón "Exportar" del reporte mensual no genera el archivo.',
      assigneeUserId: REAL.userSolmaryCastro,
      priority: 'medium' as const,
      estimatedHours: 4,
      usedHours: '3',
      status: 'closed' as const,
      resolution: 'Se corrigió la librería de exportación.',
      resolvedAt: d('2026-08-12'),
      createdAt: d('2026-08-10'),
    },
    {
      id: DEMO.ticketSistemaGestion2,
      legacyId: '0038',
      clientId: REAL.clientId,
      developmentProjectId: DEMO.projectSistemaGestion,
      title: 'Nuevo filtro por sucursal',
      serviceType: 'improvement' as const,
      description: 'Agregar filtro por sucursal en el listado de movimientos.',
      assigneeUserId: REAL.userEduardoAranda,
      priority: 'low' as const,
      estimatedHours: 6,
      usedHours: '2',
      status: 'in_progress' as const,
      createdAt: d('2026-09-01'),
    },
  ];
  for (const ticket of sistemaGestionTickets) {
    const { id, ...rest } = ticket;
    await db.insert(tickets).values(ticket).onConflictDoUpdate({ target: tickets.id, set: rest });
    await db.delete(ticketHistoryEntries).where(eq(ticketHistoryEntries.ticketId, id));
  }

  await db.insert(ticketHistoryEntries).values([
    { ticketId: DEMO.ticketSistemaGestion1, eventType: 'created', description: 'Creación de ticket', occurredAt: d('2026-08-10') },
    { ticketId: DEMO.ticketSistemaGestion1, eventType: 'done', description: 'Ticket terminado', occurredAt: d('2026-08-12') },
    { ticketId: DEMO.ticketSistemaGestion1, eventType: 'closed', description: 'Ticket cerrado', occurredAt: d('2026-08-12') },
    { ticketId: DEMO.ticketSistemaGestion2, eventType: 'created', description: 'Creación de ticket', occurredAt: d('2026-09-01') },
  ]);

  return {
    projectsCreated: 1 + supportProjectRows.length,
    ticketsCreated: 8,
  };
}
