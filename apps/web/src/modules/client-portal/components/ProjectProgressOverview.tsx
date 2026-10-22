import type { ReactNode } from 'react';
import { projectDelayLevel } from '@kora/contracts';
import { StatusPill, type StatusPillTone } from './StatusPill';
import styles from './ProjectProgressOverview.module.css';

interface ProjectProgressOverviewProps {
  /** `null` = el proyecto todavía no tiene plan cargado. */
  readonly actualPercent: number | null;
  readonly expectedPercent: number | null;
  /** Ya formateadas (dd-mm-aaaa). Sin ellas no hay pie de fechas (la ficha interna ya las muestra aparte). */
  readonly startDate?: string;
  readonly endDate?: string;
  readonly daysRemaining?: number;
  /** Sin tarjeta propia — cuando el contenedor ya es una (ficha interna). */
  readonly bare?: boolean;
  /** Leyenda arriba a la derecha, junto al estado, en vez de una fila propia bajo la barra (ficha interna). */
  readonly legendInHeader?: boolean;
  /** Dato extra bajo la barra (la ficha interna agrega HH consumidas y cobertura del plan). */
  readonly note?: ReactNode;
}

/** Cerca de los bordes, la etiqueta del plan se alinea hacia adentro para no salirse de la tarjeta. */
function edgeAlign(percent: number): string | undefined {
  if (percent > 88) return styles.alignEnd;
  if (percent < 12) return styles.alignStart;
  return undefined;
}

/** Estado en palabras, sin cálculo de diferencia: la barra ya la muestra (tramo rayado). */
function describeStatus(actual: number, expected: number): { label: string; tone: StatusPillTone; sentence: string } {
  const delay = expected - actual;
  const sentence = `A la fecha el plan contemplaba un ${expected}% de avance.`;
  if (delay < 0) return { label: 'Adelantado', tone: 'success', sentence };
  if (delay === 0) return { label: 'Al día', tone: 'success', sentence };
  return {
    label: projectDelayLevel(delay) === 'on_track' ? 'Levemente atrasado' : 'Atrasado',
    tone: projectDelayLevel(delay) === 'on_track' ? 'neutral' : 'warning',
    sentence,
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
  daysRemaining = 0,
  bare = false,
  legendInHeader = false,
  note,
}: ProjectProgressOverviewProps) {
  const containerClass = bare ? styles.bare : styles.card;

  if (actualPercent == null || expectedPercent == null) {
    return (
      <div className={containerClass}>
        <p className={styles.empty}>El avance se mostrará apenas el plan de trabajo del proyecto esté cargado.</p>
        {note && <p className={styles.note}>{note}</p>}
      </div>
    );
  }

  const status = describeStatus(actualPercent, expectedPercent);
  const behind = expectedPercent > actualPercent;
  const legend = (
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
  );

  return (
    <div className={containerClass}>
      <div className={styles.header}>
        <div className={styles.headline}>
          <span className={styles.bigNumber}>{actualPercent}%</span>
          <span className={styles.headlineText}>
            <span className={styles.headlineTitle}>del proyecto completado</span>
            <span className={styles.headlineSentence}>{status.sentence}</span>
          </span>
        </div>
        <div className={styles.headerSide}>
          {legendInHeader && legend}
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
        </div>
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

      {!legendInHeader && legend}

      {note && <p className={styles.note}>{note}</p>}

      {startDate && endDate && (
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
      )}
    </div>
  );
}
