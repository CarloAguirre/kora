import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Permission } from '@kora/contracts';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { FullPageLoader } from '@/shared/components/ui/FullPageLoader';

/**
 * Puerta de acceso a las rutas autenticadas.
 *
 * Solo controla la NAVEGACIÓN. La autorización de verdad la aplica la API en
 * cada petición: si alguien escribiera la URL a mano, la pantalla cargaría
 * vacía porque el servidor rechazaría sus datos.
 *
 * Recuerda a dónde iba la persona (`state.from`) para devolverla ahí tras
 * iniciar sesión, en vez de dejarla siempre en el inicio: un enlace compartido
 * a una ficha concreta sigue funcionando aunque la sesión haya caducado.
 */
export interface ProtectedRouteProps {
  /** Permiso exigido. Sin él, basta con estar autenticado. */
  permission?: Permission;
  /** Alternativa "cualquiera de estos" — para rutas donde el permiso completo y el acotado dan acceso a la misma pantalla (el alcance de los datos lo decide el backend). */
  anyOf?: Permission[];
}

export function ProtectedRoute({ permission, anyOf }: ProtectedRouteProps) {
  const { status } = useAuth();
  const { can, canAny } = usePermissions();
  const location = useLocation();

  // Mientras se intenta recuperar la sesión no se puede decidir nada: redirigir
  // aquí expulsaría a un usuario válido en cada recarga de página.
  if (status === 'loading') {
    return <FullPageLoader label="Cargando tu sesión…" />;
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (permission && !can(permission)) {
    return <Navigate to="/sin-permiso" replace />;
  }

  if (anyOf && anyOf.length > 0 && !canAny(...anyOf)) {
    return <Navigate to="/sin-permiso" replace />;
  }

  return <Outlet />;
}
