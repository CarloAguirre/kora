import type { ReactNode } from 'react';
import styles from './KpiCard.module.css';
import { Card } from './Card';

export type KpiTone = 'default' | 'info' | 'success' | 'warning' | 'danger';

export interface KpiCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: KpiTone;
  /** Icono junto a la etiqueta (p. ej. la alerta de "Sin asignación" en Forecast). */
  icon?: ReactNode;
  /** `lg` agranda el valor a 36px, como las tarjetas de Forecast en el Figma. */
  size?: 'md' | 'lg';
  className?: string;
  onClick?: () => void;
  active?: boolean;
}

/**
 * Tarjeta de indicador — el patrón que `DashboardMySummary` ya resolvía con
 * CSS local, extraído aquí porque el panel de Facturación de Soporte lo
 * necesita 5 veces y no vale la pena duplicar esa hoja de estilos otra vez.
 */
export function KpiCard({ label, value, sub, tone = 'default', icon, size = 'md', className, onClick, active }: KpiCardProps) {
  const classes = [styles.card, tone === 'danger' ? styles.dangerCard : '', onClick ? styles.clickable : '', active ? styles.active : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <Card
      className={classes}
      {...(onClick ? { onClick, role: 'button', tabIndex: 0 } : {})}
    >
      <span className={styles.label}>
        {icon && <span className={[styles.icon, tone !== 'default' ? styles[tone] : ''].filter(Boolean).join(' ')}>{icon}</span>}
        {label}
      </span>
      <span
        className={[styles.value, size === 'lg' ? styles.valueLg : '', tone !== 'default' ? styles[tone] : ''].filter(Boolean).join(' ')}
      >
        {value}
      </span>
      {sub && <span className={styles.sub}>{sub}</span>}
    </Card>
  );
}
