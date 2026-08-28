import type { ReactNode } from 'react';
import styles from './Card.module.css';

/**
 * Superficie de contenido elevada — la tarjeta blanca que en la v1 envuelve
 * casi cualquier tabla o formulario (`.card-container`/`.form-card`).
 */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={[styles.card, className].filter(Boolean).join(' ')}>{children}</div>;
}
