import type {
  ClientCompanyInfo,
  ClientProjectDetail,
  ClientProjectRow,
  ClientSupportContractRow,
} from '../types';

/**
 * Datos de ejemplo del portal de cliente — MOCK, no vienen de la API.
 *
 * ============================================================================
 *  QUÉ FALTA PARA CONECTAR ESTO A DATOS REALES (ver docs/DECISION-PORTAL-CLIENTE.md)
 * ============================================================================
 * 1. Los usuarios `users` no tienen `client_id`: hoy solo se enlazan a
 *    `team_id` (ver `packages/db/migrations/0000_initial_identity_schema.sql`).
 *    Hace falta una migración que agregue esa columna (nullable, FK a
 *    `clients.id`) antes de poder resolver "la empresa del usuario actual".
 * 2. Un caso de uso nuevo (p.ej. `GetClientPortalSummaryUseCase`, análogo a
 *    `GetDashboardSummaryUseCase`) que, dado el `client_id` del actor, agregue
 *    SOLO los proyectos/contratos de esa empresa — nunca de otras.
 * 3. Un endpoint + query de React Query (`client-portal.api.ts` /
 *    `client-portal.queries.ts`, mismo patrón que `dashboard.api.ts`) que
 *    reemplace estos arrays fijos.
 * 4. Las páginas de este módulo (`ClientPortalPage`, `ClientProjectDetailPage`)
 *    ya están escritas para recibir estas formas de dato — conectarlas es
 *    cambiar el `import` de aquí por el hook real, no reescribir la vista.
 *
 * Los nombres, fechas y cifras replican los ejemplos del Figma de referencia
 * (node 8756:45807, "Propuesta Mejoras Vista Cliente").
 */

export const MOCK_CLIENT_COMPANY: ClientCompanyInfo = {
  name: 'Edificate Inteligente',
  contactName: 'Camila Reyes',
  contactPosition: 'Gerente de Operaciones',
};

export const MOCK_CLIENT_PROJECTS: readonly ClientProjectRow[] = [
  {
    id: 'proy-portal-financiero',
    name: 'Portal de Gestión Financiera + Agente IA de Tickets',
    phaseCount: 3,
    tag: 'RPA/IA',
    kabeliOwnerName: 'Ana María Soto Lobos',
    clientOwnerName: 'Camila Reyes',
    startDate: '30-03-2026',
    endDate: '28-08-2026',
    health: 'active',
    stageLabel: 'En desarrollo',
    stageProgressPercent: 57,
  },
  {
    id: 'proy-automatizacion-facturas',
    name: 'Automatización de Aprobación de Facturas (RPA)',
    phaseCount: 1,
    tag: 'RPA',
    kabeliOwnerName: 'Diego Fuentes',
    clientOwnerName: 'Camila Reyes',
    startDate: '05-01-2026',
    endDate: '20-06-2026',
    health: 'at_risk',
    stageLabel: 'QA',
    stageProgressPercent: 78,
  },
  {
    id: 'proy-chatbot-atencion',
    name: 'Chatbot de Atención al Cliente (IA)',
    phaseCount: 1,
    tag: 'IA',
    kabeliOwnerName: 'Ana María Soto Lobos',
    clientOwnerName: 'Ricardo Peña',
    startDate: '10-08-2025',
    endDate: '15-12-2025',
    health: 'finished',
    stageLabel: 'Finalizado',
    stageProgressPercent: 100,
  },
];

export const MOCK_CLIENT_SUPPORT_CONTRACTS: readonly ClientSupportContractRow[] = [
  {
    id: 'contrato-consolidado',
    name: 'Consolidado Edifícate',
    planType: 'on_demand',
    kabeliOwnerName: 'José Aponte',
    startDate: '20-06-26',
    endDate: '20-12-26',
    contractedHours: 150,
    consumedHours: null,
    hourValueUf: 0.6,
    billingState: 'Facturada',
    contractStatus: 'active',
  },
  {
    id: 'contrato-app-residentes',
    name: 'App Residentes',
    planType: 'monthly',
    kabeliOwnerName: 'Ana María Soto',
    startDate: '01-08-26',
    endDate: '01-02-27',
    contractedHours: 10,
    consumedHours: 0.86,
    hourValueUf: 0.6,
    billingState: '0,6 UF',
    contractStatus: 'active',
  },
  {
    id: 'contrato-app-finanzas',
    name: 'App Finanzas',
    planType: 'monthly',
    kabeliOwnerName: 'Ana María Soto',
    startDate: '05-07-26',
    endDate: '05-07-27',
    contractedHours: 20,
    consumedHours: 0.86,
    hourValueUf: 0.6,
    billingState: '0,6 UF',
    contractStatus: 'active',
  },
  {
    id: 'contrato-developer-react',
    name: 'Developer REACT',
    planType: 'bundle',
    kabeliOwnerName: 'José Aponte',
    startDate: '20-08-26',
    endDate: null,
    contractedHours: null,
    consumedHours: 0.86,
    hourValueUf: 0.6,
    billingState: '0,6 UF',
    contractStatus: 'active',
  },
  {
    id: 'contrato-sistema-erp',
    name: 'Sistema ERP',
    planType: 'on_demand',
    kabeliOwnerName: 'José Aponte',
    startDate: '10-06-26',
    endDate: '10-08-26',
    contractedHours: null,
    consumedHours: null,
    hourValueUf: 0.86,
    billingState: 'Facturada',
    contractStatus: 'finished',
  },
];

/** Detalle de ejemplo para `proy-portal-financiero` — el único con ficha completa por ahora. */
export const MOCK_CLIENT_PROJECT_DETAIL: ClientProjectDetail = {
  id: 'proy-portal-financiero',
  name: 'Portal de Gestión Financiera + Agente IA de Tickets',
  health: 'active',
  tag: 'RPA/IA',
  company: MOCK_CLIENT_COMPANY,
  kabeliOwnerName: 'Ana María Soto Lobos',
  clientContactName: 'José Miguel Rodríguez',
  clientContactPosition: 'Socio Fundador',
  startDate: '01-04-2026',
  estimatedHours: 2489,
  progressActualPercent: 90,
  progressExpectedPercent: 90,
  endDate: '30-09-2026',
  daysRemaining: 18,
  roadmap: [
    {
      name: 'Fase 1 · Módulo Financiero',
      status: 'finished',
      startDate: '30-03-2026',
      endDate: '12-06-2026',
      currentStep: null,
      months: ['Mar', 'Abr', 'May', 'Jun'],
    },
    {
      name: 'Fase 2 · Módulo de Tickets con Agente IA',
      status: 'in_progress',
      startDate: '13-06-2026',
      endDate: '30-09-2026',
      currentStep: 'development',
      months: ['Jun', 'Jul', 'Ago', 'Sep'],
      todayMarkerPercent: 69.8,
    },
    {
      name: 'Fase 3 · Módulo de Aprobación de Presupuestos',
      status: 'upcoming',
      startDate: '01-10-2026',
      endDate: '15-01-2027',
      currentStep: null,
      months: ['Oct', 'Nov', 'Dic', 'Ene'],
    },
  ],
  gantt: {
    months: [
      { label: 'Mar', weight: 107.352 },
      { label: 'Abr', weight: 85.883 },
      { label: 'May', weight: 85.883 },
      { label: 'Jun', weight: 107.352 },
      { label: 'Jul', weight: 85.883 },
      { label: 'Ago', weight: 107.352 },
      { label: 'Sep', weight: 85.883 },
      { label: 'Oct', weight: 64.414 },
    ],
    todayPercent: 80.7,
    modules: [
      {
        badge: 'M1',
        name: 'Módulo Financiero',
        status: 'finished',
        tasks: [
          { key: 'design', state: 'done', startPercent: 15, widthPercent: 7, stateLabel: '✓' },
          { key: 'development', state: 'done', startPercent: 25, widthPercent: 12, stateLabel: '✓' },
          { key: 'qa', state: 'done', startPercent: 39, widthPercent: 2.5, stateLabel: '✓' },
          { key: 'approval', state: 'done', startPercent: 43, widthPercent: 2.5, stateLabel: '✓ OK' },
        ],
      },
      {
        badge: 'M2',
        name: 'Módulo de Tickets con Agente IA',
        status: 'in_progress',
        tasks: [
          { key: 'design', state: 'done', startPercent: 46, widthPercent: 7, stateLabel: '✓' },
          { key: 'development', state: 'in_progress', startPercent: 55, widthPercent: 21, stateLabel: 'En curso' },
          { key: 'qa', state: 'upcoming', startPercent: 78, widthPercent: 5, stateLabel: 'Próximo' },
          { key: 'approval', state: 'upcoming', startPercent: 84, widthPercent: 5, stateLabel: 'Pendiente' },
        ],
      },
      {
        badge: 'M3',
        name: 'Módulo de Aprobación de Presupuestos',
        status: 'upcoming',
        tasks: [
          { key: 'design', state: 'upcoming', startPercent: 92, widthPercent: 5, stateLabel: 'Estimado' },
          { key: 'development', state: 'upcoming', startPercent: 0, widthPercent: 0, stateLabel: '' },
          { key: 'qa', state: 'upcoming', startPercent: 0, widthPercent: 0, stateLabel: '' },
          { key: 'approval', state: 'upcoming', startPercent: 0, widthPercent: 0, stateLabel: '' },
        ],
      },
    ],
  },
  milestonesCaption: 'Fase 2 · Módulo de Tickets con Agente IA — registro de entregas y OK del cliente',
  milestones: [
    {
      id: 'hito-1',
      title: 'Diseño UX/UI entregado',
      submittedBy: 'Entregado por Rodrigo Vidal · Diseño · 13-06-2026 10:00',
      submittedAt: '13-06-2026',
      status: 'completed',
      approvalNote: 'Aprobado por Camila Reyes el 15-06-2026 09:15',
    },
    {
      id: 'hito-2',
      title: 'Desarrollo → paso a QA',
      submittedBy: 'Entregado por Equipo Desarrollo · 10-07-2026 16:40',
      submittedAt: '10-07-2026',
      status: 'completed',
    },
    {
      id: 'hito-3',
      title: 'Inicio Marcha Blanca',
      submittedBy: 'Entregado por Ana María Soto Lobos · 20-07-2026 14:00',
      submittedAt: '20-07-2026',
      status: 'awaiting_approval',
      waitingText: 'Esperando OK del cliente (Camila Reyes)',
    },
    { id: 'hito-4', title: 'QA → paso a Producción', submittedBy: 'Aún no se alcanza esta etapa', submittedAt: '', status: 'pending' },
    {
      id: 'hito-5',
      title: 'Cierre y entrega final de fase',
      submittedBy: 'Aún no se alcanza esta etapa',
      submittedAt: '',
      status: 'pending',
      pendingNote: 'Quedará pendiente de aprobación del cliente al completarse',
    },
  ],
  attentionPoints: [
    {
      id: 'atencion-1',
      description: 'Se requiere validación del cliente sobre el flujo de aprobación de presupuestos (módulo 5).',
      responsibleName: 'Camila Reyes',
      actionPlan: 'Reunión de validación agendada con el equipo financiero del cliente.',
      closingDate: '30-07-2026',
    },
  ],
  incidents: [],
  businessImpact: {
    before: { totalProcessHours: 72, peopleInvolved: 3, cycleDays: 3, modality: '100% manual' },
    after: { totalProcessHours: 6.5, peopleInvolved: 0, cycleDays: 0, modality: 'Automatizado' },
    reductionPercent: 91,
  },
  qaMetrics: {
    stageLabel: 'QA',
    caption: '300 pruebas planificadas para el módulo de tickets',
    startDate: '30-07-2026',
    endDate: '30-07-2026',
    planned: 300,
    executed: 200,
    withErrors: 20,
    remaining: 100,
  },
};

/** El resto de proyectos aún no tiene ficha de ejemplo cargada. */
export const MOCK_CLIENT_PROJECT_DETAILS_BY_ID: Readonly<Record<string, ClientProjectDetail>> = {
  [MOCK_CLIENT_PROJECT_DETAIL.id]: MOCK_CLIENT_PROJECT_DETAIL,
};
