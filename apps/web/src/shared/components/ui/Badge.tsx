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
 * Píldora + punto de color, igual que el Figma de referencia de las tablas
 * (fileKey Sqc5DJtmbLtnBhAM0y4Fww). Antes replicaba la etiqueta rectangular
 * `.badge`/`.usuario-badge` de la v1 a propósito (ver docs/DECISION-DISENO-FIGMA.md);
 * se adoptó la forma del Figma en toda la app a pedido explícito, como parte
 * de la modernización del diseño de tablas.
 */

export type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'brand';

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span className={[styles.badge, styles[tone], className].filter(Boolean).join(' ')}>
      <span className={styles.dot} aria-hidden="true" />
      {children}
    </span>
  );
}
