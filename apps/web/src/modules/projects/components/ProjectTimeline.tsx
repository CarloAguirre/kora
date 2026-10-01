import { projectDelayLevel, type ProjectDelayLevel, type ProjectProgress } from '@kora/contracts';
import { Badge, type BadgeTone } from '@/shared/components/ui/Badge';
import { formatProgressPercent } from '../lib/project-progress-display';
import styles from './ProjectTimeline.module.css';

const DELAY_TONE: Record<ProjectDelayLevel, BadgeTone> = {
  on_track: 'success',
  alert: 'warning',
  critical: 'danger',
};

/** Atraso bajo el umbral de alerta: neutro, no verde — un "Atrasado" en verde se lee como contradicción. */
function delayTone(delay: number): BadgeTone {
  const level = projectDelayLevel(delay);
  return level === 'on_track' && delay > 0 ? 'neutral' : DELAY_TONE[level];
}

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL');
const clampPct = (value: number) => Math.min(100, Math.max(0, value));
const points = (value: number) => `${value} ${value === 1 ? 'pt' : 'pts'}`;

function delayLabel(delay: number): string {
  if (delay > 0) return `Atrasado ${points(delay)}`;
  if (delay < 0) return `Adelantado ${points(-delay)}`;
  return 'Al día';
}

/** Cerca de los bordes, la etiqueta de una marca se alinea hacia adentro para no salirse de la tarjeta. */
function markAlign(percent: number): string | undefined {
  if (percent > 90) return styles.alignEnd;
  if (percent < 10) return styles.alignStart;
  return undefined;
}

/** Con poco avance el texto no cabe dentro del relleno: se muestra a su derecha, sobre la pista vacía. */
const LABEL_INSIDE_MIN_PCT = 18;

interface ProjectTimelineProps {
  progress: ProjectProgress;
  startDate: string | null;
  endDate: string | null;
}

/**
 * Avance real del proyecto (ver `projectProgressSchema`), con el estilo de la barra gruesa de fases
 * original: el eje es el % de trabajo, el relleno llega hasta el avance real y la marca "ESPERADO"
 * (mismo estilo que la píldora HOY de antes) indica dónde debería ir hoy. La marca de HH consumidas
 * va bajo la barra. La etapa del proyecto ("En desarrollo") se muestra junto a los datos del proyecto.
 */
export function ProjectTimeline({ progress, startDate, endDate }: ProjectTimelineProps) {
  const hasPlan = progress.actual != null;
  const actual = progress.actual ?? 0;
  const labelInside = actual >= LABEL_INSIDE_MIN_PCT;

  return (
    <div className={styles.timeline}>
      <div className={styles.header}>
        <span className={styles.headerStats}>
          Esperado hoy <b>{formatProgressPercent(progress.expected)}</b>
          <span className={styles.headerDot}>·</span>
          HH consumidas <b>{progress.consumption != null ? `${progress.consumption}%` : '—'}</b>
        </span>
        {progress.delay != null && <Badge tone={delayTone(progress.delay)}>{delayLabel(progress.delay)}</Badge>}
      </div>

      <div className={styles.barArea}>
        <div
          className={styles.track}
          role="img"
          aria-label={hasPlan ? `Avance real ${progress.actual}%, esperado ${progress.expected}%` : 'Sin plan cargado'}
        >
          {hasPlan ? (
            <>
              <div className={styles.fill} style={{ width: `${actual}%` }}>
                {labelInside && <span className={styles.fillLabel}>Avance real {actual}%</span>}
              </div>
              {!labelInside && (
                <span className={styles.outsideLabel} style={{ left: `${actual}%` }}>
                  Avance real {actual}%
                </span>
              )}
            </>
          ) : (
            <span className={styles.emptyLabel}>Sin plan cargado</span>
          )}
        </div>

        {hasPlan && progress.expected != null && (
          <span className={styles.expected} style={{ left: `${progress.expected}%` }}>
            <span className={[styles.expectedPill, markAlign(progress.expected)].filter(Boolean).join(' ')}>
              ESPERADO {progress.expected}%
            </span>
            <span className={styles.expectedLine} />
          </span>
        )}

        {progress.consumption != null && (
          <span className={styles.consumption} style={{ left: `${clampPct(progress.consumption)}%` }}>
            <span className={[styles.consumptionLabel, markAlign(clampPct(progress.consumption))].filter(Boolean).join(' ')}>
              HH {progress.consumption}%
            </span>
          </span>
        )}
      </div>

      <div className={styles.scale}>
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>

      <div className={styles.footer}>
        <span>{startDate ? `Inicio ${formatDate(startDate)}` : 'Sin fecha de inicio'}</span>
        <span className={styles.note}>
          {hasPlan
            ? [
                progress.planCoverage != null && progress.planCoverage < 100
                  ? `Plan cargado: ${progress.planCoverage}% de las HH estimadas de las fases.`
                  : null,
                progress.estimatedByCount ? 'Parte del avance se calculó por cantidad de tareas (sin HH estimadas).' : null,
              ]
                .filter(Boolean)
                .join(' ')
            : 'El avance se mide cuando las fases tienen tareas con HH estimadas (tab Roadmap).'}
        </span>
        <span>{endDate ? `Entrega ${formatDate(endDate)}` : 'Sin fecha de entrega'}</span>
      </div>
    </div>
  );
}
