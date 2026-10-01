import type { TransactionContext } from '@kora/core';
import type { SegmentForecastWeek } from '../services/segment-forecast-planner';

export interface SegmentForecastTarget {
  readonly segmentId: string;
  readonly projectId: string;
  readonly clientId: string | null;
  /** Va a `comments` de cada fila — identifica la fase y el tramo en la pantalla de Forecast. */
  readonly comments: string;
}

/**
 * Las filas de Forecast que genera un tramo de ejecución del Roadmap. Puerto propio del módulo de
 * proyectos: `ForecastModule` ya importa `ProjectsModule`, así que no se puede depender de él sin
 * crear un ciclo.
 */
export interface SegmentForecastStore {
  /** Feriados (días no laborables) entre `start` y `end`, inclusive. */
  listNonWorkingDates(start: Date, end: Date, context?: TransactionContext): Promise<Date[]>;
  /** Borra todas las filas generadas por el tramo y crea `weeks` en su lugar (tipo "Proyecto"). */
  replaceForSegment(
    target: SegmentForecastTarget,
    weeks: readonly SegmentForecastWeek[],
    now: Date,
    context?: TransactionContext,
  ): Promise<void>;
}

export const SEGMENT_FORECAST_STORE = Symbol('SegmentForecastStore');
