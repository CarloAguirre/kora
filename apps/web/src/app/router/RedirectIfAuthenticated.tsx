import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { FullPageLoader } from '@/shared/components/ui/FullPageLoader';

/**
 * Impide entrar a las pantallas de acceso con la sesión ya abierta.
 *
 * Sin esto, alguien autenticado que abra /login vería el formulario y podría
 * pensar que su sesión caducó.
 */
export function RedirectIfAuthenticated() {
  const { status } = useAuth();

  if (status === 'loading') return <FullPageLoader />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
