import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthenticatedUser, LoginInput, LoginResponse } from '@kora/contracts';
import { api, tokenStore } from '@/shared/lib/api-client';

/**
 * Estado de sesión de la aplicación.
 *
 * Es la única fuente de verdad sobre "quién está conectado". La v1 tenía tres
 * en paralelo —`SessionContext`, `localStorage.kora_user` y el propio cliente de
 * Supabase—, con funciones sueltas (`getStoredUser`, `getUserRole`) que leían
 * `localStorage` directamente desde cualquier componente. Podían discrepar, y
 * discrepaban.
 *
 * Aquí el usuario vive en memoria de React y se recupera del servidor al
 * arrancar. Nada de identidad se guarda en `localStorage`: ni el token, ni el
 * rol, ni los permisos. Un permiso guardado en el navegador es un permiso que
 * el usuario puede editar con la consola abierta.
 */

export interface AuthContextValue {
  readonly user: AuthenticatedUser | null;
  readonly status: 'loading' | 'authenticated' | 'anonymous';
  signIn(credentials: LoginInput): Promise<AuthenticatedUser>;
  signOut(): Promise<void>;
  refreshUser(): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const queryClient = useQueryClient();

  /**
   * Recuperación de sesión al cargar la página.
   *
   * El access token vive en memoria y se pierde al recargar; la cookie del
   * refresh token sobrevive. Así que al arrancar se intenta renovar: si
   * funciona, la persona sigue dentro sin volver a escribir su contraseña.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const restored = await api.restoreSession();

      if (!restored) {
        if (!cancelled) setStatus('anonymous');
        return;
      }

      try {
        const current = await api.get<AuthenticatedUser>('/auth/me');
        if (!cancelled) {
          setUser(current);
          setStatus('authenticated');
        }
      } catch {
        if (!cancelled) {
          tokenStore.set(null);
          setStatus('anonymous');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Si el cliente HTTP se queda sin token —porque la renovación falló— la
   * sesión se cierra en la interfaz. Sin esta suscripción, la aplicación
   * seguiría mostrando el menú de un usuario que ya no puede hacer nada.
   */
  //
  // También se vacía la caché de consultas: con `staleTime` de 30 s, quien
  // entrara después en el mismo navegador veía datos del usuario anterior
  // (su campanita, sus horas) hasta que la consulta se renovara.
  useEffect(() => {
    return tokenStore.subscribe((token) => {
      if (token === null) {
        queryClient.clear();
        setUser(null);
        setStatus('anonymous');
      }
    });
  }, [queryClient]);

  const signIn = useCallback(
    async (credentials: LoginInput): Promise<AuthenticatedUser> => {
      const response = await api.post<LoginResponse>('/auth/login', credentials);
      // Por si se entra con otra cuenta sin haber cerrado la sesión anterior.
      queryClient.clear();
      tokenStore.set(response.tokens.accessToken);
      setUser(response.user);
      setStatus('authenticated');
      return response.user;
    },
    [queryClient],
  );

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Da igual si el servidor no contesta: localmente la sesión se cierra
      // igual, y el token caduca solo en minutos.
    } finally {
      tokenStore.set(null);
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const refreshUser = useCallback(async (): Promise<void> => {
    const current = await api.get<AuthenticatedUser>('/auth/me');
    setUser(current);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, signIn, signOut, refreshUser }),
    [user, status, signIn, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
