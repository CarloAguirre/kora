import type { ReactNode } from 'react';
import styles from './Badge.module.css';

/**
 * Etiqueta de estado.
 *
 * Recibe un tono semántico ('success', 'danger'…), no un color. Que el estado
 * "Habilitado" sea verde se decide en un único sitio —el componente que traduce
 * estado a tono—, así que cambiar esa correspondencia no obliga a buscar
 * colores sueltos por las pantallas.
 *
 * Forma y colores replican `.badge`/`.usuario-badge` de la v1 (etiqueta
 * rectangular de esquinas suaves) — no la píldora con punto de color del
 * Figma de referencia, ver docs/DECISION-DISENO-FIGMA.md.
 */

export type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'brand';

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return <span className={[styles.badge, styles[tone], className].filter(Boolean).join(' ')}>{children}</span>;
}
