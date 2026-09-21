import { eq } from 'drizzle-orm';
import type { Database } from '../client';
import {
  hourEntries,
  projectModuleDeliveries,
  projectModules,
  projectModuleSegments,
  projectModuleTasks,
  projectObservations,
  projectPaymentMilestones,
  projects,
  projectTeamMembers,
  projectTeams,
} from '../schema';

/**
 * Siembra de contenido para el proyecto REAL "Operaciones logísticas" del
 * cliente Amicar (Sociedad de Créditos Automotrices S.A.), para que su vista
 * de portal de cliente (`/clientes/:clientId/vista-cliente/:projectId`)
 * tenga datos completos: fases, tareas, equipos, horas, bitácora y
 * facturación. Mismo criterio que `demo-client-portal.ts`: reutiliza
 * entidades REALES ya existentes (cliente, proyecto, contacto, equipos,
 * staff de Kabeli) y solo agrega filas nuevas con ids fijos (idempotente).
 *
 * El proyecto de soporte del mismo cliente ("Soporte Amicar") ya existe con
 * datos reales (plan activo + 48 tickets) — no se toca acá.
 *
 * El proyecto "Operaciones logísticas" (`legacy_id = 250`) viene de una
 * sincronización incremental desde la v1 que corre por separado en cada
 * ambiente — mismo `legacy_id`/contenido, pero un `id` (uuid) generado en
 * cada corrida, DISTINTO entre local y el servidor. Por eso acá se resuelve
 * por `legacyId`, nunca por un uuid fijo copiado de un ambiente en particular.
 *
 * Se corre a mano con `pnpm --filter @kora/db seed:demo-amicar`, nunca como
 * parte de un despliegue.
 */

const LEGACY_ID_OPERACIONES_LOGISTICAS = 250;

// IDs reales, ya existentes en la base — NO se crean acá.
const REAL = {
  clientId: 'a22d8f5d-b18d-470d-a2cf-8e62e911a71c', // Amicar
  contactDiegoCasanova: 'af881d8e-d130-4071-ae8b-eb8da19c4a5e',

  teamRpa: '50a796e3-3382-4c4e-baa1-11b2430df60d',
  teamDev: '91d19384-334b-4cc8-a776-c5a59036316f', // "Desarrollo"

  userPabloVega: '91fce407-a72d-4875-ab65-faef05c8044f', // líder del proyecto, RPA
  userJoseAponte: '5edce9f8-b995-43be-86c4-702aa929c2ee', // RPA
  userMarcoArraiz: 'd29f7d6b-10ba-4ddb-8f21-cbfaea71f2fe', // RPA
  userCristianCancino: '72333755-27c5-479b-a651-e50c27670b7c', // RPA
  userJorgeHinojosa: 'b80aa895-55f5-4756-9e9b-bebccd5c04f2', // RPA
  userAnaSoto: '89cdcf98-2801-4e29-b181-db3ca22e71c7', // Desarrollo
  userSolmaryCastro: 'ea6d5a9b-e3bb-47f7-a064-60ac27a593fb', // Desarrollo

  // team_members.id (membresía de equipo, distinto de users.id)
  teamMemberPabloVega: '56a06d1a-6991-4cbf-8f23-ea70efd696ae',
  teamMemberJoseAponte: 'bb8db163-a015-40e8-91ef-848d7baa1ba1',
  teamMemberMarcoArraiz: '87aae901-4b7d-453c-9cbc-7b644983fa55',
  teamMemberCristianCancino: '86fa647b-288b-4a92-9237-82582ab5b42e',
  teamMemberJorgeHinojosa: '621540ca-88fd-42ae-9ab1-1c9476c47764',
  teamMemberAnaSoto: '497bc6df-7cfb-4e2e-83b1-a5723d2e3362',
  teamMemberSolmaryCastro: '257b94ce-8e5e-4ee3-981a-3e7dd502f220',
} as const;

// IDs nuevos, fijos para que el seed sea idempotente (upsert/reemplazo por padre).
const DEMO = {
  moduleFase1: 'aca00000-0000-4000-8000-000000000011',
  moduleFase2: 'aca00000-0000-4000-8000-000000000012',
  moduleFase3: 'aca00000-0000-4000-8000-000000000013',
  moduleFase4: 'aca00000-0000-4000-8000-000000000014',

  projectTeamRpa: 'aca00000-0000-4000-8000-000000000021',
  projectTeamDev: 'aca00000-0000-4000-8000-000000000022',
} as const;

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export interface SeedAmicarOperacionesResult {
  modulesCreated: number;
  observationsCreated: number;
}

export async function seedAmicarOperaciones(db: Database): Promise<SeedAmicarOperacionesResult> {
  // 0. Resolver el proyecto por legacy_id — ver comentario de archivo: el uuid
  //    de este proyecto es distinto en cada ambiente, así que nunca se fija a mano.
  const [projectRow] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.legacyId, LEGACY_ID_OPERACIONES_LOGISTICAS))
    .limit(1);
  if (!projectRow) {
    throw new Error(
      `No se encontró el proyecto "Operaciones logísticas" (legacy_id=${LEGACY_ID_OPERACIONES_LOGISTICAS}) en esta base — ¿corrió el ETL/sync desde la v1 en este ambiente?`,
    );
  }
  const projectId = projectRow.id;

  // 1. Proyecto — completar campos que hoy están vacíos (era un prospecto recién creado).
  await db
    .update(projects)
    .set({
      primaryContactId: REAL.contactDiegoCasanova,
      salesStage: 'approved',
      phase: 'development',
      priority: 'high',
      startDate: d('2026-06-01'),
      endDate: d('2026-10-20'),
      estimatedDeliveryDate: d('2026-10-20'),
      soldHours: '380',
      usedHours: '245.5',
      expectedProgress: 68,
      actualProgress: 60,
      testEnvironmentLink: 'https://staging.kabeli.cl/amicar-operaciones',
      documentationLink: 'https://docs.kabeli.cl/amicar-operaciones',
      impactBeforeHours: '40',
      impactBeforePeople: '4 personas',
      impactBeforeDuration: '5 días laborales (8h c/u)',
      impactBeforeModality: '100% manual',
      impactAfterHours: '6',
      impactAfterPeople: '1 persona · solo supervisión',
      impactAfterDuration: 'Mismo día',
      impactAfterModality: 'Automatizado con RPA',
      qaTestingStartDate: d('2026-08-05'),
      qaTestingEndDate: d('2026-08-10'),
      qaEvaluatedModule: 'Bots de asignación de rutas y reportes de cobranza',
      qaPlannedTests: 120,
      qaExecutedTests: 95,
      qaFailedTests: 8,
      periodReportDate: d('2026-09-18'),
      periodReportAchievements: [
        'Se completó el levantamiento y mapeo de los procesos operativos de logística y cobranza.',
        'Bot de asignación de rutas desplegado y validado en producción.',
        'Bot de generación de reportes de cobranza desplegado y validado en producción.',
        'Se inició la integración del dashboard de indicadores operativos, pendiente de validar KPIs con el cliente.',
      ],
    })
    .where(eq(projects.id, projectId));

  // 2. Tramos de pago ("Facturación") — se reemplazan por completo en cada corrida.
  await db.delete(projectPaymentMilestones).where(eq(projectPaymentMilestones.projectId, projectId));
  await db.insert(projectPaymentMilestones).values([
    {
      projectId: projectId,
      name: 'Inicio',
      percent: '40',
      amount: '3840000',
      invoiceNumber: 'F-5102',
      issuedAt: d('2026-06-05'),
      status: 'paid',
      paidAt: d('2026-06-12'),
      sortOrder: 1,
    },
    {
      projectId: projectId,
      name: 'Marcha blanca',
      percent: '30',
      amount: '2880000',
      invoiceNumber: 'F-5301',
      issuedAt: d('2026-09-10'),
      status: 'invoiced',
      sortOrder: 2,
    },
    {
      projectId: projectId,
      name: 'Cierre',
      percent: '30',
      amount: '2880000',
      status: 'pending',
      sortOrder: 3,
    },
  ]);

  // 3. Fases (módulos) + su Gantt (tramos, tareas, entregas) ————————————————
  await db.delete(projectModules).where(eq(projectModules.projectId, projectId));
  await db.insert(projectModules).values([
    {
      id: DEMO.moduleFase1,
      projectId: projectId,
      name: 'Descubrimiento y mapeo de procesos',
      initialStage: 'discovery',
      currentStage: 'closed',
      estimatedStartDate: d('2026-06-01'),
      estimatedEndDate: d('2026-06-20'),
    },
    {
      id: DEMO.moduleFase2,
      projectId: projectId,
      name: 'Desarrollo de automatizaciones RPA',
      initialStage: 'discovery',
      currentStage: 'production',
      estimatedStartDate: d('2026-06-20'),
      estimatedEndDate: d('2026-08-15'),
    },
    {
      id: DEMO.moduleFase3,
      projectId: projectId,
      name: 'Integración y reportería',
      initialStage: 'discovery',
      currentStage: 'development',
      estimatedStartDate: d('2026-08-15'),
      estimatedEndDate: d('2026-09-25'),
    },
    {
      id: DEMO.moduleFase4,
      projectId: projectId,
      name: 'Piloto y marcha blanca',
      initialStage: 'discovery',
      currentStage: 'discovery',
      estimatedStartDate: d('2026-09-25'),
      estimatedEndDate: d('2026-10-20'),
    },
  ]);

  // Tramos ("Roadmap por Fases" del portal).
  await db.insert(projectModuleSegments).values([
    { moduleId: DEMO.moduleFase1, teamId: REAL.teamRpa, name: 'Levantamiento de procesos operativos', startDate: d('2026-06-01'), endDate: d('2026-06-10') },
    { moduleId: DEMO.moduleFase1, teamId: REAL.teamRpa, name: 'Diseño de flujos de automatización', startDate: d('2026-06-10'), endDate: d('2026-06-20') },
    { moduleId: DEMO.moduleFase2, teamId: REAL.teamRpa, name: 'Desarrollo de bot de asignación de rutas', startDate: d('2026-06-20'), endDate: d('2026-07-20') },
    { moduleId: DEMO.moduleFase2, teamId: REAL.teamRpa, name: 'Desarrollo de bot de reportes de cobranza', startDate: d('2026-07-20'), endDate: d('2026-08-05') },
    { moduleId: DEMO.moduleFase2, teamId: REAL.teamDev, name: 'Integración con sistema core', startDate: d('2026-08-05'), endDate: d('2026-08-15') },
    { moduleId: DEMO.moduleFase3, teamId: REAL.teamDev, name: 'Integración con dashboard interno', startDate: d('2026-08-15'), endDate: d('2026-09-10') },
    { moduleId: DEMO.moduleFase3, teamId: REAL.teamRpa, name: 'QA funcional', startDate: d('2026-09-10'), endDate: d('2026-09-25') },
    { moduleId: DEMO.moduleFase4, teamId: REAL.teamRpa, name: 'Piloto con equipo de operaciones', startDate: d('2026-09-25'), endDate: d('2026-10-10') },
    { moduleId: DEMO.moduleFase4, teamId: REAL.teamRpa, name: 'Ajustes y cierre', startDate: d('2026-10-10'), endDate: d('2026-10-20') },
  ]);

  // Tareas puntuales (marcador "Tareas" del Roadmap).
  await db.insert(projectModuleTasks).values([
    { moduleId: DEMO.moduleFase1, teamId: REAL.teamRpa, assigneeUserId: REAL.userMarcoArraiz, name: 'Mapear proceso de asignación de rutas', date: d('2026-06-08'), status: 'done', scope: 'diseno' },
    { moduleId: DEMO.moduleFase1, teamId: REAL.teamRpa, assigneeUserId: REAL.userJoseAponte, name: 'Definir reglas de negocio de cobranza', date: d('2026-06-16'), status: 'done', scope: 'diseno' },
    { moduleId: DEMO.moduleFase2, teamId: REAL.teamRpa, assigneeUserId: REAL.userMarcoArraiz, name: 'Bot de asignación de rutas', date: d('2026-07-18'), status: 'done', scope: 'desarrollo' },
    { moduleId: DEMO.moduleFase2, teamId: REAL.teamRpa, assigneeUserId: REAL.userJoseAponte, name: 'Bot de generación de reportes de cobranza', date: d('2026-08-03'), status: 'done', scope: 'desarrollo' },
    { moduleId: DEMO.moduleFase2, teamId: REAL.teamRpa, assigneeUserId: REAL.userCristianCancino, name: 'Pruebas unitarias de bots', date: d('2026-08-10'), status: 'done', scope: 'qa' },
    { moduleId: DEMO.moduleFase2, teamId: REAL.teamRpa, assigneeUserId: REAL.userJorgeHinojosa, name: 'Ajustes según feedback QA', date: d('2026-08-14'), status: 'done', scope: 'desarrollo' },
    { moduleId: DEMO.moduleFase3, teamId: REAL.teamDev, assigneeUserId: REAL.userAnaSoto, name: 'Diseño de dashboard de indicadores', date: d('2026-08-25'), status: 'done', scope: 'diseno' },
    { moduleId: DEMO.moduleFase3, teamId: REAL.teamDev, assigneeUserId: REAL.userSolmaryCastro, name: 'Desarrollo de endpoints de reportería', date: d('2026-09-18'), status: 'in_progress', scope: 'desarrollo' },
    { moduleId: DEMO.moduleFase3, teamId: REAL.teamRpa, assigneeUserId: REAL.userCristianCancino, name: 'QA funcional del dashboard', date: d('2026-09-24'), status: 'todo', scope: 'qa' },
    { moduleId: DEMO.moduleFase4, teamId: REAL.teamRpa, assigneeUserId: REAL.userJoseAponte, name: 'Capacitación equipo de operaciones', date: d('2026-10-02'), status: 'todo', scope: 'revision_cliente' },
  ]);

  // Entregas — 1 por fase.
  await db.insert(projectModuleDeliveries).values([
    { moduleId: DEMO.moduleFase1, teamId: REAL.teamRpa, estimatedDate: d('2026-06-20'), status: 'delivered' },
    { moduleId: DEMO.moduleFase2, teamId: REAL.teamRpa, estimatedDate: d('2026-08-15'), status: 'delivered' },
    { moduleId: DEMO.moduleFase3, teamId: REAL.teamDev, estimatedDate: d('2026-09-25'), status: 'planned' },
    { moduleId: DEMO.moduleFase4, teamId: REAL.teamRpa, estimatedDate: d('2026-10-20'), status: 'planned' },
  ]);

  // 4. Equipos asignados al proyecto (con líder y horas) — sección "Equipos".
  await db.delete(projectTeamMembers).where(eq(projectTeamMembers.projectId, projectId));
  await db.delete(projectTeams).where(eq(projectTeams.projectId, projectId));
  await db.insert(projectTeams).values([
    { id: DEMO.projectTeamRpa, projectId: projectId, teamId: REAL.teamRpa, leaderUserId: REAL.userPabloVega, assignedHours: '280', memberCount: 4 },
    { id: DEMO.projectTeamDev, projectId: projectId, teamId: REAL.teamDev, leaderUserId: REAL.userAnaSoto, assignedHours: '100', memberCount: 2 },
  ]);
  await db.insert(projectTeamMembers).values([
    { projectId: projectId, teamId: REAL.teamRpa, teamMemberId: REAL.teamMemberPabloVega, activity: 'Liderazgo técnico y diseño de bots', assignedHours: '90', consumedHours: '65' },
    { projectId: projectId, teamId: REAL.teamRpa, teamMemberId: REAL.teamMemberJoseAponte, activity: 'Desarrollo de automatizaciones de cobranza', assignedHours: '90', consumedHours: '70' },
    { projectId: projectId, teamId: REAL.teamRpa, teamMemberId: REAL.teamMemberMarcoArraiz, activity: 'Desarrollo de bots de asignación de rutas', assignedHours: '70', consumedHours: '55' },
    { projectId: projectId, teamId: REAL.teamRpa, teamMemberId: REAL.teamMemberCristianCancino, activity: 'QA funcional de bots', assignedHours: '30', consumedHours: '15' },
    { projectId: projectId, teamId: REAL.teamDev, teamMemberId: REAL.teamMemberAnaSoto, activity: 'Integración con dashboard interno', assignedHours: '60', consumedHours: '30' },
    { projectId: projectId, teamId: REAL.teamDev, teamMemberId: REAL.teamMemberSolmaryCastro, activity: 'Desarrollo de endpoints de reportería', assignedHours: '40', consumedHours: '20' },
  ]);

  // 5. Horas — se AGREGAN sobre las 2 entradas reales ya existentes (no se borran).
  await db.insert(hourEntries).values([
    { userId: REAL.userMarcoArraiz, projectId: projectId, moduleId: DEMO.moduleFase1, category: 'Diseño', description: 'Levantamiento de procesos con equipo de operaciones de Amicar.', hours: '4', date: d('2026-06-05'), status: 'approved' },
    { userId: REAL.userPabloVega, projectId: projectId, moduleId: DEMO.moduleFase2, category: 'Desarrollo', description: 'Desarrollo del bot de asignación de rutas.', hours: '8', date: d('2026-07-10'), status: 'approved' },
    {
      userId: REAL.userJoseAponte,
      projectId: projectId,
      moduleId: DEMO.moduleFase2,
      category: 'Bloqueo',
      description: 'Seguimiento de bloqueo con el cliente.',
      hasBlocker: true,
      blockerDescription: 'Amicar no ha entregado credenciales de acceso al sistema core para pruebas de integración.',
      hours: '2',
      date: d('2026-08-01'),
      status: 'approved',
    },
    { userId: REAL.userCristianCancino, projectId: projectId, moduleId: DEMO.moduleFase2, category: 'QA', description: 'Pruebas unitarias de bots de cobranza.', hours: '6', date: d('2026-08-09'), status: 'approved' },
    { userId: REAL.userAnaSoto, projectId: projectId, moduleId: DEMO.moduleFase3, category: 'Desarrollo', description: 'Diseño de dashboard de indicadores operativos.', hours: '5', date: d('2026-08-22'), status: 'approved' },
    {
      userId: REAL.userSolmaryCastro,
      projectId: projectId,
      moduleId: DEMO.moduleFase3,
      category: 'Bloqueo',
      description: 'Dependencia de definición de KPIs por parte del cliente.',
      hasBlocker: true,
      blockerDescription: 'Cliente aún no valida los KPIs finales para el dashboard de reportería.',
      hours: '3',
      date: d('2026-09-17'),
      status: 'approved',
    },
  ]);

  // 6. Bitácora — feed cronológico del portal cliente.
  await db.delete(projectObservations).where(eq(projectObservations.projectId, projectId));
  await db.insert(projectObservations).values([
    {
      projectId: projectId,
      moduleId: DEMO.moduleFase1,
      type: 'hito',
      title: 'Kickoff del proyecto',
      message: 'Reunión de inicio con Amicar. Alcance confirmado: automatización de asignación de rutas y reportes de cobranza.',
      status: 'activo',
      date: d('2026-06-01'),
      authorUserId: REAL.userPabloVega,
    },
    {
      projectId: projectId,
      moduleId: DEMO.moduleFase1,
      type: 'compromiso',
      title: 'Levantamiento de procesos completado',
      message: 'Se completó el levantamiento y mapeo de los procesos operativos de logística y cobranza.',
      status: 'cumplido',
      date: d('2026-06-20'),
      authorUserId: REAL.userMarcoArraiz,
    },
    {
      projectId: projectId,
      moduleId: DEMO.moduleFase2,
      type: 'hito',
      title: 'Bot de asignación de rutas en producción',
      message: 'El bot de asignación de rutas fue desplegado y validado en ambiente productivo.',
      status: 'activo',
      date: d('2026-07-20'),
      authorUserId: REAL.userJoseAponte,
    },
    {
      projectId: projectId,
      moduleId: DEMO.moduleFase2,
      type: 'incidente',
      title: 'Bloqueo por acceso a sistema core',
      message: 'Amicar no había entregado credenciales de acceso al sistema core; se resolvió el 04-08-2026 tras coordinar con TI del cliente.',
      status: 'resuelto',
      date: d('2026-08-01'),
      authorUserId: REAL.userJoseAponte,
    },
    {
      projectId: projectId,
      moduleId: DEMO.moduleFase2,
      type: 'hito',
      title: 'Fase de desarrollo RPA cerrada',
      message: 'Se completó el desarrollo de ambos bots (asignación de rutas y reportes de cobranza), con entrega validada por el cliente.',
      status: 'activo',
      date: d('2026-08-15'),
      authorUserId: REAL.userPabloVega,
    },
    {
      projectId: projectId,
      moduleId: DEMO.moduleFase3,
      type: 'atencion',
      title: 'Esperando validación de KPIs',
      message: 'Cliente aún no valida los KPIs finales para el dashboard de reportería; bloquea el cierre del módulo.',
      status: 'abierto',
      date: d('2026-09-17'),
      authorUserId: REAL.userSolmaryCastro,
    },
    {
      projectId: projectId,
      moduleId: DEMO.moduleFase3,
      type: 'compromiso',
      title: 'Reunión de validación de KPIs agendada',
      message: 'Se agendó reunión con Diego Casanova (Amicar) para el 24-09-2026 para validar los KPIs del dashboard.',
      status: 'pendiente',
      date: d('2026-09-22'),
      authorUserId: REAL.userAnaSoto,
    },
  ]);

  return {
    modulesCreated: 4,
    observationsCreated: 7,
  };
}
