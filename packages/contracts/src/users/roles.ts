import { z } from 'zod';

/**
 * Catálogo de roles y permisos.
 *
 * En la v1 el rol era un entero (`usuario.rol`) mapeado a mano en el front
 * (1=administrador, 2/4/5=lider, 7=comercial, 8=pmo...) y cada pantalla
 * comparaba contra strings de rol. Cualquier rol nuevo obligaba a tocar
 * decenas de archivos: el sistema estaba cerrado a la extensión.
 *
 * En la v2 el rol es un código estable y la autorización se hace SIEMPRE por
 * permiso. Agregar un rol es agregar una fila y su lista de permisos: ningún
 * caso de uso ni componente cambia.
 */

export const ROLE_CODES = ['admin', 'pmo', 'leader', 'collaborator', 'commercial'] as const;
export const roleCodeSchema = z.enum(ROLE_CODES);
export type RoleCode = z.infer<typeof roleCodeSchema>;

export const PERMISSIONS = [
  // Usuarios
  'users:read',
  'users:create',
  'users:update',
  'users:delete',
  'users:change_status',
  'users:assign_role',
  'users:reset_password',
  // Equipos
  'teams:read',
  'teams:manage',
  // Clientes
  'clients:read',
  'clients:manage',
  // Proyectos
  'projects:read',
  'projects:read_assigned',
  'projects:manage',
  // Tickets
  'tickets:read',
  'tickets:read_assigned',
  'tickets:create',
  'tickets:manage',
  // Horas (HH)
  'hours:register',
  'hours:read_own',
  'hours:read_team',
  'hours:read_all',
  'hours:approve',
  // Forecast y facturación
  'forecast:read',
  'forecast:manage',
  'billing:read',
  'billing:manage',
  // Administración del sistema
  'audit:read',
  'admin:legacy_import',
] as const;

export const permissionSchema = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof permissionSchema>;

/** Permisos por defecto de cada rol. La BD es la fuente de verdad en runtime;
 *  esto es la semilla y el fallback tipado para el front. */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<RoleCode, readonly Permission[]>> = {
  admin: [...PERMISSIONS],
  // Reemplazar datos de negocio por un archivo es una operación destructiva, no
  // administración estándar: a diferencia del resto de PERMISSIONS, pmo no la hereda.
  pmo: [...PERMISSIONS].filter((p) => p !== 'admin:legacy_import'),
  leader: [
    'teams:read',
    'teams:manage',
    'clients:read',
    'projects:read_assigned',
    'tickets:read',
    'tickets:create',
    'tickets:manage',
    'hours:register',
    'hours:read_own',
    'hours:read_team',
    'hours:approve',
    'forecast:read',
    'forecast:manage',
    'billing:read',
  ],
  collaborator: [
    'tickets:read_assigned',
    'tickets:create',
    'hours:register',
    'hours:read_own',
  ],
  commercial: ['clients:read', 'tickets:read_assigned', 'projects:read_assigned'],
};

/** Etiquetas en español para la interfaz. Separadas del código del rol para que
 *  renombrar una etiqueta jamás rompa una regla de autorización. */
export const ROLE_LABELS: Readonly<Record<RoleCode, string>> = {
  admin: 'Administrador',
  pmo: 'PMO',
  leader: 'Líder',
  collaborator: 'Colaborador',
  commercial: 'Comercial',
};

/**
 * Perfil de líder: NO es un rol, es una propiedad derivada de las asignaciones
 * reales del usuario (si lidera proyectos, equipos o ambos). Se recalcula solo;
 * nunca se edita a mano.
 */
export const leaderProfileSchema = z.enum(['project_manager', 'team_leader', 'both']);
export type LeaderProfile = z.infer<typeof leaderProfileSchema>;

export const LEADER_PROFILE_LABELS: Readonly<Record<LeaderProfile, string>> = {
  project_manager: 'Líder PM',
  team_leader: 'Líder de equipo',
  both: 'Líder PM y de equipo',
};

/** Roles que pertenecen al nivel administrativo (admin y PMO comparten permisos). */
export const ADMIN_TIER_ROLES: readonly RoleCode[] = ['admin', 'pmo'];

export function isAdminTier(role: RoleCode): boolean {
  return ADMIN_TIER_ROLES.includes(role);
}
