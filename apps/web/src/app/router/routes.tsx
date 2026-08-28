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
import { TeamsListPage } from '@/modules/teams/pages/TeamsListPage';
import { TeamDetailPage } from '@/modules/teams/pages/TeamDetailPage';
import { TeamMemberDetailPage } from '@/modules/teams/pages/TeamMemberDetailPage';
import { ProjectsListPage } from '@/modules/projects/pages/ProjectsListPage';
import { ProjectDetailPage } from '@/modules/projects/pages/ProjectDetailPage';
import { NewProjectPage } from '@/modules/projects/pages/NewProjectPage';
import { HoursListPage } from '@/modules/hours/pages/HoursListPage';
import { HoursApprovalsPage } from '@/modules/hours/pages/HoursApprovalsPage';
import { TicketsListPage } from '@/modules/tickets/pages/TicketsListPage';
import { NewTicketPage } from '@/modules/tickets/pages/NewTicketPage';
import { TicketDetailPage } from '@/modules/tickets/pages/TicketDetailPage';
import { ForecastPage } from '@/modules/forecast/pages/ForecastPage';
import { DashboardPage } from '@/modules/dashboard/pages/DashboardPage';
import { ForbiddenPage } from '@/app/pages/ForbiddenPage';
import { NotFoundPage } from '@/app/pages/NotFoundPage';

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
    children: [{ path: '/proyectos/nuevo', element: <NewProjectPage /> }],
  },
  {
    element: <ProtectedRoute anyOf={['projects:read', 'projects:read_assigned']} />,
    children: [{ path: '/proyectos/:projectId', element: <ProjectDetailPage /> }],
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
    children: [{ path: '/tickets', element: <TicketsListPage /> }],
  },
  {
    element: <ProtectedRoute permission="tickets:create" />,
    children: [{ path: '/tickets/nuevo', element: <NewTicketPage /> }],
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

  { path: '*', element: <NotFoundPage /> },
]);
