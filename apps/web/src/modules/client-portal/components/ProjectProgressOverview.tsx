import { projectDelayLevel } from '@kora/contracts';
import { StatusPill, type StatusPillTone } from './StatusPill';
import styles from './ProjectProgressOverview.module.css';

interface ProjectProgressOverviewProps {
  /** `null` = el proyecto todavía no tiene plan cargado. */
  readonly actualPercent: number | null;
  readonly expectedPercent: number | null;
  /** Ya formateadas (dd-mm-aaaa). */
  readonly startDate: string;
  readonly endDate: string;
  readonly daysRemaining: number;
}

const points = (value: number) => `${value} ${value === 1 ? 'punto' : 'puntos'}`;

/** Cerca de los bordes, la etiqueta del plan se alinea hacia adentro para no salirse de la tarjeta. */
function edgeAlign(percent: number): string | undefined {
  if (percent > 88) return styles.alignEnd;
  if (percent < 12) return styles.alignStart;
  return undefined;
}

/** Estado en palabras: el cliente lee "vamos X puntos bajo lo planificado", no "Atrasado 10 pts". */
function describeStatus(actual: number, expected: number): { label: string; tone: StatusPillTone; sentence: string } {
  const delay = expected - actual;
  if (delay < 0) {
    return {
      label: 'Adelantado',
      tone: 'success',
      sentence: `Vamos ${points(-delay)} por sobre lo planificado a la fecha (${expected}%).`,
    };
  }
  if (delay === 0) {
    return { label: 'Al día', tone: 'success', sentence: `Vamos justo en lo planificado a la fecha (${expected}%).` };
  }
  return {
    label: projectDelayLevel(delay) === 'on_track' ? 'Levemente atrasado' : 'Atrasado',
    tone: projectDelayLevel(delay) === 'on_track' ? 'neutral' : 'warning',
    sentence: `A la fecha el plan contemplaba un ${expected}% de avance: vamos ${points(delay)} por debajo.`,
  };
}

/**
 * "Avance del proyecto" del portal de cliente — versión simplificada de `ProjectTimeline` (ficha
 * interna). Deja fuera lo que solo le sirve al equipo (HH consumidas, cobertura del plan) y cuenta
 * lo mismo en lenguaje llano: cuánto va, cuánto debería ir hoy y la diferencia entre ambos, que se
 * pinta como un tramo rayado entre el avance real y la marca del plan.
 */
export function ProjectProgressOverview({
  actualPercent,
  expectedPercent,
  startDate,
  endDate,
  daysRemaining,
}: ProjectProgressOverviewProps) {
  if (actualPercent == null || expectedPercent == null) {
    return (
      <div className={styles.card}>
        <p className={styles.empty}>El avance se mostrará apenas el plan de trabajo del proyecto esté cargado.</p>
      </div>
    );
  }

  const status = describeStatus(actualPercent, expectedPercent);
  const behind = expectedPercent > actualPercent;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.headline}>
          <span className={styles.bigNumber}>{actualPercent}%</span>
          <span className={styles.headlineText}>
            <span className={styles.headlineTitle}>del proyecto completado</span>
            <span className={styles.headlineSentence}>{status.sentence}</span>
          </span>
        </div>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </div>

      <div className={styles.barArea}>
        <div
          className={styles.track}
          role="img"
          aria-label={`Avance real ${actualPercent}%, planificado a la fecha ${expectedPercent}%`}
        >
          {behind && (
            <div
              className={styles.gap}
              style={{ left: `${actualPercent}%`, width: `${expectedPercent - actualPercent}%` }}
            />
          )}
          <div className={styles.fill} style={{ width: `${actualPercent}%` }} />
        </div>

        <span className={styles.planMark} style={{ left: `${expectedPercent}%` }}>
          <span className={styles.planLine} />
          <span className={[styles.planLabel, edgeAlign(expectedPercent)].filter(Boolean).join(' ')}>
            Plan a la fecha · {expectedPercent}%
          </span>
        </span>
      </div>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={[styles.swatch, styles.swatchFill].join(' ')} /> Avance real
        </span>
        <span className={styles.legendItem}>
          <span className={styles.swatchLine} /> Lo planificado a hoy
        </span>
        {behind && (
          <span className={styles.legendItem}>
            <span className={[styles.swatch, styles.swatchGap].join(' ')} /> Diferencia por recuperar
          </span>
        )}
      </div>

      <div className={styles.footer}>
        <span className={styles.footerDate}>
          <span className={styles.footerLabel}>Inicio</span>
          {startDate}
        </span>
        {daysRemaining > 0 && (
          <span className={styles.remaining}>
            Faltan <b>{daysRemaining}</b> {daysRemaining === 1 ? 'día' : 'días'} para la entrega
          </span>
        )}
        <span className={[styles.footerDate, styles.footerDateEnd].join(' ')}>
          <span className={styles.footerLabel}>Entrega</span>
          {endDate}
        </span>
      </div>
    </div>
  );
}
