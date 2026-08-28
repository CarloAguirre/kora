import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from '../context/AuthContext';

/**
 * Acceso a la sesión.
 *
 * Falla ruidosamente si se usa fuera del proveedor. Es preferible un error
 * claro en desarrollo a devolver `null` y que el fallo aparezca más tarde, en
 * otro sitio, como un "cannot read property of null" sin relación aparente.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  }

  return context;
}
