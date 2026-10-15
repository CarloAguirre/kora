import type { UserStatus } from '@kora/contracts';

interface AssignableCandidate {
  readonly value: string;
  readonly label: string;
  readonly status: UserStatus;
}

/**
 * Opciones de un selector de responsable (tarea, entrega, líder, miembro…): los
 * deshabilitados quedan fuera — ya no entran al sistema ni cargan horas, así que
 * asignarles algo lo deja sin dueño. Los bloqueados sí se ofrecen: ese estado lo
 * pone el sistema por intentos fallidos y se revierte solo.
 *
 * Si el valor actual del campo es un deshabilitado, se conserva marcado como tal:
 * así el campo no aparece vacío y guardar otro cambio no lo borra sin que nadie lo note.
 */
export function assignableOptions<T>(
  items: readonly T[],
  toCandidate: (item: T) => AssignableCandidate,
  currentValue?: string | null,
): Array<{ value: string; label: string }> {
  const candidates = items.map(toCandidate);
  const options = candidates
    .filter((candidate) => candidate.status !== 'disabled')
    .map(({ value, label }) => ({ value, label }));
  const current = currentValue ? candidates.find((candidate) => candidate.value === currentValue) : undefined;
  if (current?.status === 'disabled') options.push({ value: current.value, label: `${current.label} (deshabilitado)` });
  return options;
}
