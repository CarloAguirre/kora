import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './router/routes';
import { AuthProvider } from '@/modules/auth/context/AuthContext';
import { ToastProvider } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';

/**
 * Composición de la aplicación.
 *
 * El orden de los proveedores importa: `AuthProvider` envuelve al router porque
 * las guardas de ruta necesitan saber si hay sesión, y `QueryClientProvider`
 * envuelve a todo porque cualquier pantalla puede pedir datos.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // No tiene sentido reintentar un 401 o un 403: el resultado será el
      // mismo tres veces, y cada intento retrasa el mensaje al usuario. Los
      // fallos de red sí merecen un reintento.
      retry: (failureCount, error) => {
        if (error instanceof ApiRequestError && error.status < 500) return false;
        return failureCount < 2;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Una escritura nunca se reintenta sola: podría duplicar un alta.
      retry: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
