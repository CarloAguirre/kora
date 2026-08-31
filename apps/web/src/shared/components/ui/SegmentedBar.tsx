import styles from './SegmentedBar.module.css';

export interface SegmentedBarSegment {
  readonly key: string;
  readonly value: number;
  readonly color: string;
  /** Nombre de la categoría, para el lector de pantalla — el color nunca es el único portador del significado. */
  readonly label: string;
}

/**
 * Barra horizontal segmentada — composición de un total en categorías (p.ej.
 * aprobaciones pendientes por equipo). El hueco de 2px entre segmentos y las
 * puntas redondeadas del conjunto son el mecanismo de separación, no un
 * borde. Siempre se muestra junto a una leyenda con texto (nunca solo color).
 */
export function SegmentedBar({ segments }: { segments: readonly SegmentedBarSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const visible = segments.filter((segment) => segment.value > 0);
  if (total <= 0 || visible.length === 0) return null;

  return (
    <div className={styles.bar} role="img" aria-label={visible.map((s) => `${s.label}: ${s.value}`).join(', ')}>
      {visible.map((segment) => (
        <div
          key={segment.key}
          className={styles.segment}
          style={{ width: `${(segment.value / total) * 100}%`, background: segment.color }}
        />
      ))}
    </div>
  );
}
