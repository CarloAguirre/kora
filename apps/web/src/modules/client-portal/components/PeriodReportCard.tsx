import styles from './PeriodReportCard.module.css';
import type { ClientPeriodReport } from '../types';

/**
 * "Avance del periodo" — está OCULTA en el Figma de referencia en ambas
 * variantes del archivo (node 9663:25049 / 9663:24051: `get_screenshot`
 * devuelve 1×1 px en las dos), pero se construye igual por pedido explícito:
 * un reporte narrativo de logros del período, no una métrica calculada.
 */
export function PeriodReportCard({ report }: { report: ClientPeriodReport }) {
  return (
    <div className={styles.card}>
      <h3 className={styles.title}>Reporte del periodo</h3>
      <p className={styles.date}>Reporte del {report.reportDate}</p>
      <ul className={styles.list}>
        {report.achievements.map((achievement, index) => (
          <li key={index} className={styles.item}>
            {achievement}
          </li>
        ))}
      </ul>
    </div>
  );
}
