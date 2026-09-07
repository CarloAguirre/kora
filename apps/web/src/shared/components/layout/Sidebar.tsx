import { NavLink } from 'react-router-dom';
import styles from './Sidebar.module.css';
import { KoraLogo } from './KoraLogo';
import {
  DashboardIcon,
  UsersIcon,
  BuildingIcon,
  UsersGroupIcon,
  FolderOpenIcon,
  TicketIcon,
  TrendingUpIcon,
  SettingsIcon,
  HelpCircleIcon,
} from '../icons/Icons';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import type { Permission } from '@kora/contracts';
import type { ReactNode } from 'react';

/**
 * Navegación lateral.
 *
 * Cada entrada declara el permiso que exige, y el menú se filtra solo. En la v1
 * la navegación se decidía con un mapa de rol → lista de secciones
 * (`NAV_PERMISSIONS`) más ramas por perfil de líder dentro del propio
 * componente; cada rol nuevo obligaba a tocar ese archivo y a revisar los `if`.
 * Aquí un módulo nuevo se añade a esta lista con su permiso y ya está.
 */

interface NavigationItem {
  readonly to: string;
  readonly label: string;
  readonly icon: ReactNode;
  /** Permiso mínimo para ver la entrada. Omitir si basta con estar autenticado. */
  readonly permission?: Permission;
  /** Alternativa "cualquiera de estos" — el permiso completo y el acotado llevan a la misma pantalla. */
  readonly anyOf?: readonly Permission[];
}

const NAVIGATION: readonly NavigationItem[] = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: <DashboardIcon size={20} />,
  },
  {
    to: '/clientes',
    label: 'Clientes',
    icon: <BuildingIcon size={20} />,
    permission: 'clients:read',
  },
  {
    to: '/proyectos',
    label: 'Proyectos',
    icon: <FolderOpenIcon size={20} />,
    anyOf: ['projects:read', 'projects:read_assigned'],
  },
  // Portal de cliente: mismas etiquetas "Proyectos"/"Soporte" que el resto del
  // menú, pero apuntando a las páginas de solo-lectura del propio cliente en
  // vez de a los listados internos — el permiso `own_client` es exclusivo del
  // rol `cliente`, así que nunca coinciden para un mismo usuario con las
  // entradas de arriba/abajo. Ver docs/DECISION-PORTAL-CLIENTE.md.
  {
    to: '/portal/proyectos',
    label: 'Proyectos',
    icon: <FolderOpenIcon size={20} />,
    permission: 'projects:read_own_client',
  },
  {
    to: '/portal/soporte',
    label: 'Soporte',
    icon: <HelpCircleIcon size={20} />,
    permission: 'tickets:read_own_client',
  },
  {
    to: '/equipos',
    label: 'Equipos',
    icon: <UsersGroupIcon size={20} />,
    permission: 'teams:read',
  },
  {
    to: '/forecast',
    label: 'Forecast',
    icon: <TrendingUpIcon size={20} />,
    permission: 'forecast:read',
  },
  {
    to: '/tickets',
    label: 'Tickets',
    icon: <TicketIcon size={20} />,
    anyOf: ['tickets:read', 'tickets:read_assigned'],
  },
  {
    to: '/usuarios',
    label: 'Administración',
    icon: <UsersIcon size={20} />,
    permission: 'users:read',
  },
  {
    to: '/administracion/importar-datos',
    label: 'Importar datos',
    icon: <SettingsIcon size={20} />,
    permission: 'admin:legacy_import',
  },
];

export interface SidebarProps {
  open: boolean;
  onNavigate: () => void;
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  const { can, canAny } = usePermissions();
  const { user } = useAuth();

  const visibleItems = NAVIGATION.filter((item) => {
    // El Dashboard interno (KPIs, aprobaciones, forecast…) no tiene permiso
    // propio porque siempre aplica — salvo para `cliente`, que no tiene
    // ninguno de esos permisos y de todos modos rebota a /portal/proyectos
    // (ver DashboardPage.tsx). Ocultarlo evita un enlace que solo lleva de
    // vuelta a donde ya está.
    if (item.to === '/dashboard' && user?.role === 'cliente') return false;
    if (item.permission) return can(item.permission);
    if (item.anyOf) return canAny(...item.anyOf);
    return true;
  });

  return (
    <aside
      className={[styles.sidebar, open ? styles.open : ''].filter(Boolean).join(' ')}
      aria-label="Navegación principal"
    >
      <div className={styles.brand}>
        <KoraLogo />
      </div>

      <nav className={styles.nav}>
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              [styles.navItem, isActive ? styles.active : ''].filter(Boolean).join(' ')
            }
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
