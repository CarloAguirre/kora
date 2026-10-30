import { Navigate, createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { RedirectIfAuthenticated } from './RedirectIfAuthenticated';
import { LoginPage } from '@/modules/auth/pages/LoginPage';
import { ForgotPasswordPage } from '@/modules/auth/pages/ForgotPasswordPage';
import { SetPasswordPage } from '@/modules/auth/pages/SetPasswordPage';
import { UsersListPage } from '@/modules/users/pages/UsersListPage';
import { LegacyImportPage } from '@/modules/admin-legacy-import/pages/LegacyImportPage';
import { ClientsListPage } from '@/modules/clients/pages/ClientsListPage';
import { ClientDetailPage } from '@/modules/clients/pages/ClientDetailPage';
import { ClientPortalPreviewPage } from '@/modules/clients/pages/ClientPortalPreviewPage';
import { ClientProjectPreviewPage } from '@/modules/clients/pages/ClientProjectPreviewPage';
import { ClientSupportContractPreviewPage } from '@/modules/clients/pages/ClientSupportContractPreviewPage';
import { TeamsListPage } from '@/modules/teams/pages/TeamsListPage';
import { TeamDetailPage } from '@/modules/teams/pages/TeamDetailPage';
import { TeamMemberDetailPage } from '@/modules/teams/pages/TeamMemberDetailPage';
import { ProjectsListPage } from '@/modules/projects/pages/ProjectsListPage';
import { ProjectDetailPage } from '@/modules/projects/pages/ProjectDetailPage';
import { ProjectTeamDetailPage } from '@/modules/projects/pages/ProjectTeamDetailPage';
import { NewProjectPage } from '@/modules/projects/pages/NewProjectPage';
import { SupportPlanDetailPage } from '@/modules/projects/pages/SupportPlanDetailPage';
import { HoursListPage } from '@/modules/hours/pages/HoursListPage';
import { HoursApprovalsPage } from '@/modules/hours/pages/HoursApprovalsPage';
import { TicketsListPage } from '@/modules/tickets/pages/TicketsListPage';
import { TicketDetailPage } from '@/modules/tickets/pages/TicketDetailPage';
import { TicketHistoryPage } from '@/modules/tickets/pages/TicketHistoryPage';
import { ForecastPage } from '@/modules/forecast/pages/ForecastPage';
import { BillingLedgerPage } from '@/modules/billing/pages/BillingLedgerPage';
import { DashboardPage } from '@/modules/dashboard/pages/DashboardPage';
import { ClientPortalPage } from '@/modules/client-portal/pages/ClientPortalPage';
import { ClientProjectDetailPage } from '@/modules/client-portal/pages/ClientProjectDetailPage';
import { ClientSupportContractDetailPage } from '@/modules/client-portal/pages/ClientSupportContractDetailPage';
import { ForbiddenPage } from '@/app/pages/ForbiddenPage';
import { NotFoundPage } from '@/app/pages/NotFoundPage';
import { CalculatorPage } from '@/modules/estimation/pages/CalculatorPage';
import { EstimationWorkspacePage } from '@/modules/estimation/pages/EstimationWorkspacePage';
import { QuotationWorkspacePage } from '@/modules/estimation/pages/QuotationWorkspacePage';

/**
 * Tabla de rutas.
 *
 * Es una tabla plana y legible: mirándola se sabe qué existe y qué permiso
 * exige cada cosa. En la v1 esto no era posible — muchas rutas apuntaban a
 * componentes "Router" definidos en `App.tsx` que volvían a ramificar por rol y
 * por perfil de líder, así que para saber qué se renderizaba en una URL había
 * que leer código, no la tabla.
 *
 * Aquí la ramificación por permisos ocurre en un único sitio (`ProtectedRoute`)
 * y de forma declarativa.
 */
export const router = createBrowserRouter([
  // ── Públicas ──────────────────────────────────────────────────────────
  {
    element: <RedirectIfAuthenticated />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/recuperar', element: <ForgotPasswordPage /> },
    ],
  },
  // Definir contraseña es accesible siempre: alguien con sesión abierta puede
  // llegar por el enlace de una invitación reenviada.
  { path: '/definir-contrasena', element: <SetPasswordPage /> },

  // ── Autenticadas ──────────────────────────────────────────────────────
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/sin-permiso', element: <ForbiddenPage /> },
    ],
  },

  // ── Módulo de usuarios ────────────────────────────────────────────────
  {
    element: <ProtectedRoute permission="users:read" />,
    children: [{ path: '/usuarios', element: <UsersListPage /> }],
  },

  // ── Importador de datos legacy por archivo ──────────────────────────────
  {
    element: <ProtectedRoute permission="admin:legacy_import" />,
    children: [{ path: '/administracion/importar-datos', element: <LegacyImportPage /> }],
  },

  // ── Módulo de clientes ────────────────────────────────────────────────
  {
    element: <ProtectedRoute permission="clients:read" />,
    children: [
      { path: '/clientes', element: <ClientsListPage /> },
      { path: '/clientes/:clientId', element: <ClientDetailPage /> },
      { path: '/clientes/:clientId/vista-cliente', element: <ClientPortalPreviewPage /> },
      { path: '/clientes/:clientId/vista-cliente/soporte', element: <ClientPortalPreviewPage /> },
      { path: '/clientes/:clientId/vista-cliente/soporte/:contractId', element: <ClientSupportContractPreviewPage /> },
      { path: '/clientes/:clientId/vista-cliente/:projectId', element: <ClientProjectPreviewPage /> },
    ],
  },

  // ── Módulo de equipos ─────────────────────────────────────────────────
  {
    element: <ProtectedRoute permission="teams:read" />,
    children: [
      { path: '/equipos', element: <TeamsListPage /> },
      { path: '/equipos/:teamId', element: <TeamDetailPage /> },
      { path: '/equipos/:teamId/miembros/:memberId', element: <TeamMemberDetailPage /> },
    ],
  },

  // ── Módulo de proyectos ───────────────────────────────────────────────
  {
    element: <ProtectedRoute anyOf={['projects:read', 'projects:read_assigned']} />,
    children: [{ path: '/proyectos', element: <ProjectsListPage /> }],
  },
  {
    element: <ProtectedRoute permission="projects:manage" />,
    children: [
      { path: '/proyectos/nuevo', element: <NewProjectPage /> },
      { path: '/proyectos/:projectId/estimacion', element: <EstimationWorkspacePage /> },
    ],
  },
  {
    element: <ProtectedRoute anyOf={['projects:read', 'projects:read_assigned']} />,
    children: [
      { path: '/proyectos/:projectId', element: <ProjectDetailPage /> },
      { path: '/proyectos/:projectId/equipos/:teamId', element: <ProjectTeamDetailPage /> },
    ],
  },

  // ── Cotizaciones: Líder PM del proyecto o Gerencia/PMO; API verifica pertenencia. ──
  {
    element: <ProtectedRoute anyOf={['projects:manage', 'projects:read_assigned']} />,
    children: [
      { path: '/calculadora', element: <CalculatorPage /> },
      { path: '/proyectos/:projectId/cotizacion', element: <QuotationWorkspacePage /> },
    ],
  },

  // ── Contratos de soporte ──────────────────────────────────────────────
  // Crear un contrato (nuevo o consolidando proyectos terminados) se hace
  // desde `/proyectos/nuevo` eligiendo tipo Soporte — ver `NewProjectPage`.
  {
    element: <ProtectedRoute anyOf={['projects:read', 'projects:read_assigned']} />,
    children: [{ path: '/soporte/:planId', element: <SupportPlanDetailPage /> }],
  },
  {
    element: <ProtectedRoute permission="billing:read" />,
    children: [
      { path: '/facturacion', element: <BillingLedgerPage /> },
      // La pestaña "Soporte" de arriba reemplazó a la página dedicada — se conserva el redirect por enlaces/marcadores viejos.
      { path: '/facturacion-soporte', element: <Navigate to="/facturacion" replace /> },
    ],
  },

  // ── Módulo de horas ───────────────────────────────────────────────────
  {
    element: <ProtectedRoute permission="hours:read_own" />,
    children: [{ path: '/horas', element: <HoursListPage /> }],
  },
  {
    element: <ProtectedRoute permission="hours:approve" />,
    children: [{ path: '/horas/aprobaciones', element: <HoursApprovalsPage /> }],
  },

  // ── Módulo de tickets ─────────────────────────────────────────────────
  {
    element: <ProtectedRoute anyOf={['tickets:read', 'tickets:read_assigned']} />,
    children: [
      { path: '/tickets', element: <TicketsListPage /> },
      { path: '/tickets/historial-tickets', element: <TicketHistoryPage /> },
    ],
  },
  {
    element: <ProtectedRoute anyOf={['tickets:read', 'tickets:read_assigned']} />,
    children: [{ path: '/tickets/:ticketId', element: <TicketDetailPage /> }],
  },

  // ── Módulo de forecast ────────────────────────────────────────────────
  {
    element: <ProtectedRoute permission="forecast:read" />,
    children: [{ path: '/forecast', element: <ForecastPage /> }],
  },

  // ── Portal de cliente ─────────────────────────────────────────────────
  // Vista de solo lectura para el rol `cliente` (contacto externo de una
  // empresa cliente) — ver docs/DECISION-PORTAL-CLIENTE.md. `ClientPortalPage`
  // sirve ambas rutas y decide la pestaña activa por la URL, igual que las dos
  // entradas separadas "Proyectos"/"Soporte" del Figma de referencia.
  {
    element: <ProtectedRoute permission="projects:read_own_client" />,
    children: [
      { path: '/portal/proyectos', element: <ClientPortalPage /> },
      { path: '/portal/proyectos/:projectId', element: <ClientProjectDetailPage /> },
    ],
  },
  {
    element: <ProtectedRoute permission="tickets:read_own_client" />,
    children: [
      { path: '/portal/soporte', element: <ClientPortalPage /> },
      { path: '/portal/soporte/:contractId', element: <ClientSupportContractDetailPage /> },
    ],
  },

  { path: '*', element: <NotFoundPage /> },
], {
  // Vacío ('/') salvo que el build se haga con `vite build --base=/algo/`
  // (así se despliega hoy en el EC2 de pruebas, con v1 y v2 compartiendo
  // dominio bajo /v1 y /v2) — sin esto, navegar dentro de la app deriva la
  // URL fuera de ese prefijo y un refresh/enlace directo 404 en el servidor.
  basename: import.meta.env.BASE_URL,
});
