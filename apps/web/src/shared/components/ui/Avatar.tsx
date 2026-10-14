import styles from './Avatar.module.css';

/**
 * Círculo con las iniciales de una persona y un color determinístico. El
 * mismo patrón ya se repetía a mano en varios módulos (p. ej.
 * `ForecastMemberCard`) — acá se centraliza para los usos nuevos.
 */

const AVATAR_COLORS = ['#2563EB', '#16A34A', '#EA580C', '#7C3AED', '#DB2777', '#0EA5E9', '#65A30D', '#D97706'];

export interface AvatarProps {
  name: string;
  size?: number;
  /** Fondo fijo en vez del color determinístico — p. ej. el navy de la ficha de ticket. */
  color?: string;
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0]!;
  const second = parts.length > 1 ? parts[1]![0]! : (parts[0]![1] ?? '');
  return (first + second).toUpperCase();
}

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

export function Avatar({ name, size = 28, color, className }: AvatarProps) {
  return (
    <span
      className={[styles.avatar, className].filter(Boolean).join(' ')}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: color ?? colorFor(name) }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
