/**
 * Interpretación de errores de Postgres para la capa de aplicación.
 *
 * No importa el driver ni el ORM: solo mira la forma del error (`code` en
 * SQLSTATE). Cualquier caso de uso de cualquier módulo puede preguntarle "¿esto
 * fue una violación de unicidad?" sin acoplarse al caso de uso de otro módulo
 * ni a Drizzle.
 */

/** Violación de índice o restricción única (SQLSTATE 23505). */
export function isUniqueViolation(error: unknown): boolean {
  return getSqlState(error) === '23505';
}

/** Violación de clave foránea (SQLSTATE 23503). */
export function isForeignKeyViolation(error: unknown): boolean {
  return getSqlState(error) === '23503';
}

function getSqlState(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}
