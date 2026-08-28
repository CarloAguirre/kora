import { useCallback, useMemo } from 'react';
import type { Permission } from '@kora/contracts';
import { useAuth } from './useAuth';

/**
 * Comprobación de permisos en la interfaz.
 *
 * IMPORTANTE: esto decide qué se MUESTRA, no qué se PUEDE hacer. La
 * autorización real la aplica el servidor en cada petición. Ocultar un botón
 * es cortesía con el usuario, no una medida de seguridad: quien edite el estado
 * de React puede hacerlo aparecer, y aun así la API lo rechazará.
 *
 * Las comprobaciones son siempre por permiso, nunca por rol, para que la
 * interfaz y el servidor apliquen exactamente el mismo criterio.
 */
export interface UsePermissionsResult {
  can(permission: Permission): boolean;
  canAny(...permissions: Permission[]): boolean;
  canAll(...permissions: Permission[]): boolean;
}

export function usePermissions(): UsePermissionsResult {
  const { user } = useAuth();

  const granted = useMemo(() => new Set(user?.permissions ?? []), [user]);

  const can = useCallback((permission: Permission) => granted.has(permission), [granted]);

  const canAny = useCallback(
    (...permissions: Permission[]) => permissions.some((permission) => granted.has(permission)),
    [granted],
  );

  const canAll = useCallback(
    (...permissions: Permission[]) => permissions.every((permission) => granted.has(permission)),
    [granted],
  );

  return { can, canAny, canAll };
}
