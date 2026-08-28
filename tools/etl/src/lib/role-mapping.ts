import type { RoleCode, UserStatus } from '@kora/contracts';

/**
 * Equivalencias entre el modelo de la v1 y el de la v2.
 *
 * Este archivo es el corazón semántico de la migración: aquí queda escrito, de
 * una vez y de forma revisable, qué significaba cada número y cada etiqueta del
 * sistema anterior. En la v1 esta tabla de equivalencias vivía dispersa en
 * `mapDbRoleToUserRole()`, en constantes del front y en comparaciones sueltas
 * dentro de los componentes.
 */

/**
 * `usuario.rol` (entero, FK a la tabla `rol`) → código de rol de la v2.
 *
 * Catálogo original:
 *   1 Administrador · 2 Lider · 4 Líder PM · 5 Líder de equipo
 *   6 Colaborador   · 7 Comercial · 8 PMO
 *
 * Los tres sabores de líder (2, 4, 5) colapsan en un único rol `leader`: la
 * distinción entre PM y líder de equipo NO es un rol, es una consecuencia de
 * las asignaciones que tenga la persona, y en la v2 se deriva sola. Mantenerla
 * como rol obligaba a editar a mano un dato que ya estaba implícito en los
 * datos, con el riesgo permanente de que quedaran contradictorios.
 */
const ROLE_BY_LEGACY_ID: Readonly<Record<number, RoleCode>> = {
  1: 'admin',
  2: 'leader',
  4: 'leader',
  5: 'leader',
  6: 'collaborator',
  7: 'commercial',
  8: 'pmo',
};

export function mapLegacyRole(legacyRoleId: number | null): {
  role: RoleCode;
  warning: string | null;
} {
  if (legacyRoleId === null) {
    return { role: 'collaborator', warning: 'rol nulo en origen; se asume colaborador' };
  }

  const mapped = ROLE_BY_LEGACY_ID[legacyRoleId];
  if (!mapped) {
    // Rol desconocido: se degrada al mínimo privilegio en vez de adivinar.
    // Conceder de menos se corrige con un clic; conceder de más es un incidente.
    return {
      role: 'collaborator',
      warning: `rol ${legacyRoleId} desconocido; se asigna colaborador (mínimo privilegio)`,
    };
  }

  return { role: mapped, warning: null };
}

/** `profiles.estado` (texto en español) → estado de la v2. */
const STATUS_BY_LEGACY_LABEL: Readonly<Record<string, UserStatus>> = {
  habilitado: 'active',
  deshabilitado: 'disabled',
  bloqueado: 'blocked',
};

export function mapLegacyStatus(legacyStatus: string | null): {
  status: UserStatus;
  warning: string | null;
} {
  if (!legacyStatus) {
    return { status: 'active', warning: null };
  }

  const mapped = STATUS_BY_LEGACY_LABEL[legacyStatus.trim().toLowerCase()];
  if (!mapped) {
    return {
      status: 'disabled',
      warning: `estado "${legacyStatus}" desconocido; se deja deshabilitado para revisión manual`,
    };
  }

  return { status: mapped, warning: null };
}

/**
 * Separa un nombre completo en nombre y apellido.
 *
 * `equipo_miembro.nombre` guarda el nombre completo en un solo campo. La regla
 * es simple —primera palabra al nombre, resto al apellido— y precisamente por
 * eso solo se usa como último recurso, cuando no hay una fila de `usuario` con
 * los campos ya separados.
 */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().replace(/\s+/g, ' ').split(' ');
  if (parts.length === 0 || !parts[0]) return { firstName: 'Sin', lastName: 'nombre' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '-' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/** Normaliza un correo igual que lo hace el value object `Email` del dominio. */
export function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}
