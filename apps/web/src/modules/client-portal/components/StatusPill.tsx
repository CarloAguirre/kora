import type { ReactNode } from 'react';
import styles from './StatusPill.module.css';

export type StatusPillTone = 'success' | 'warning' | 'neutral' | 'info';

/**
 * Píldora de estado con punto de color — el lenguaje visual del Figma del
 * portal de cliente (node 8756:45807), NO el `Badge` compartido.
 *
 * El equipo ya adoptó y luego revirtió esta misma forma (píldora + punto) para
 * las pantallas internas por no calzar con la v1 en producción — ver
 * docs/DECISION-DISENO-FIGMA.md. El portal de cliente es una pantalla nueva
 * sin una v1 que proteger, así que aquí sí se sigue el Figma — pero como
 * componente propio de este módulo, para no reintroducir esa forma en
 * `shared/components/ui/Badge` y arrastrar de nuevo el drift que ya se corrigió.
 */
export function StatusPill({ tone, children }: { tone: StatusPillTone; children: ReactNode }) {
  return (
    <span className={[styles.pill, styles[tone]].join(' ')}>
      <span className={styles.dot} />
      {children}
    </span>
  );
}
