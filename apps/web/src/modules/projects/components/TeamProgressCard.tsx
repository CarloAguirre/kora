import { useId, useState } from 'react';
import { Card } from '@/shared/components/ui/Card';
import { getTeamStyle } from '../utils/team-style';
import type { TeamProgress, TeamBlockProgress } from '../lib/team-progress';
import styles from './TeamProgressCard.module.css';

const hours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });
const percent = (value: number) => value.toLocaleString('es-CL') + '%';

function ProgressMiniTrack({ real, planned }: { real: number; planned: number }) {
  return (
    <div className={styles.miniTrack} role="img"
      aria-label={'Avance real ' + percent(real) + ', esperado ' + percent(planned)}>
      <span className={styles.miniFill} style={{ width: percent(real) }} />
      <span className={styles.miniTarget} style={{ left: percent(planned) }} />
    </div>
  );
}

function BlockNote({ block }: { block: TeamBlockProgress }) {
  if (block.isClosed) return <>100% real: bloque cerrado con su entrega aprobada o cierre registrado</>;
  return <>
    {percent(block.actualPercent)} real, {percent(block.expectedPercent)} según plan;
    {' '}{percent(block.coveragePercent)} del bloque desglosado en tareas
  </>;
}

interface Props {
  readonly progress: TeamProgress;
  readonly teamName: string;
}

/**
 * El indicador se calcula con la misma fuente de datos del Roadmap operativo.
 * No intenta inferir HH consumidas por bloque: los registros históricos de
 * horas se asocian a módulo, no a project_module_segments.
 */
export function TeamProgressCard({ progress, teamName }: Props) {
  const [expanded, setExpanded] = useState(false);
  const descriptionId = useId();
  const style = getTeamStyle(teamName);
  const actual = progress.actualPercent ?? 0;
  const expected = progress.expectedPercent ?? 0;
  const diff = Math.max(0, expected - actual);
  const laggingPhases = [...progress.phases]
    .filter((phase) => phase.gapPoints > 0)
    .sort((a, b) => b.gapPoints - a.gapPoints);
  const state = !progress.hasPlan ? 'Sin plan' : progress.paused ? 'Pausado' :
    actual < expected ? 'Atrasado' : actual > expected ? 'Adelantado' : 'Al día';

  return (
    <Card className={styles.card}>
      <div className={styles.heading}>
        <h2>Avance del equipo</h2>
        <span className={[styles.status, state === 'Atrasado' ? styles.behind :
          state === 'Adelantado' || state === 'Al día' ? styles.onTrack : styles.neutral].join(' ')}>
          <span aria-hidden="true">●</span> {state}
        </span>
      </div>

      <div className={styles.summary}>
        <strong>{progress.hasPlan ? percent(actual) : '—'}</strong>
        <div>
          <b>del trabajo del equipo completado</b>
          <small>{!progress.hasPlan
            ? 'Sin bloques con HH planificadas para este equipo.'
            : 'A la fecha el plan contemplaba un ' + percent(expected) + ' de avance.'}</small>
        </div>
      </div>

      <div className={styles.timelineWrap}>
        <div className={styles.timeline} role="img"
          aria-label={progress.hasPlan
            ? 'Avance real ' + percent(actual) + '; plan a la fecha ' + percent(expected)
            : 'Sin plan de avance del equipo'}>
          {progress.hasPlan && <>
            <span className={styles.actualFill} style={{ width: percent(actual) }} />
            {diff > 0 && <span className={styles.pendingFill}
              style={{ left: percent(actual), width: percent(diff) }} />}
            <span className={styles.expectedLine} style={{ left: percent(expected) }} />
          </>}
        </div>
        {progress.hasPlan && <div className={styles.targetLabel}
          style={{
            left: percent(expected),
            transform: expected <= 10 ? 'translateX(0)' :
              expected >= 90 ? 'translateX(-100%)' : 'translateX(-50%)',
          }}>
          Plan a la fecha: {percent(expected)}
        </div>}
      </div>

      <p className={styles.consumption}>
        HH consumidas: {progress.consumptionPercent === null
          ? 'sin HH asignadas como referencia de consumo'
          : percent(progress.consumptionPercent) + ' de las asignadas al equipo'}.
      </p>

      <div className={styles.explainer}>
        <button type="button" className={styles.toggle} aria-expanded={expanded}
          aria-controls={descriptionId} onClick={() => setExpanded((value) => !value)}>
          <span className={styles.chevron} aria-hidden="true">{expanded ? '⌄' : '›'}</span>
          ¿Cómo se calcula este avance?
        </button>
        {expanded && <div id={descriptionId} className={styles.explanation}>
          {progress.hasPlan ? (
            <p className={styles.lead}>
              Hoy deberías llevar <b>{percent(expected)}</b>: según las fechas de los bloques de trabajo,
              a hoy deberían estar completadas <b>{hours(progress.expectedHours)}</b> de las
              {' '}<b>{hours(progress.plannedHours)} HH</b> planificadas.
              Llevas <b>{percent(actual)}</b>, es decir,
              {' '}<b>{hours(progress.actualHours)} HH</b> completadas.
            </p>
          ) : (
            <p className={styles.lead}>Aún no se pueden calcular los porcentajes:
              configura las HH estimadas y las fechas de los bloques del equipo en el Roadmap.</p>
          )}

          <div className={styles.methodology}>
            <div><b>1. El plan</b>
              <p>Son las horas de todos los bloques de trabajo:
                {' '}{hours(progress.plannedHours)} HH equivalen al 100%. Se distribuyen
                entre sus fechas de inicio y fin.</p>
            </div>
            <div><b>2. Las tareas</b>
              <p>El avance real considera las HH estimadas de cada tarea
                <b> aprobada</b> en su bloque; sin aprobación aún no suma avance.</p>
            </div>
            <div><b>3. La entrega</b>
              <p>Cuando la entrega de cierre está <b>aprobada</b> o el bloque
                tiene cierre registrado, ese bloque cuenta al 100%.</p>
            </div>
          </div>

          {laggingPhases.length > 0 && !progress.paused && (
            <div className={styles.reasons}>
              <strong>Qué explica la diferencia</strong>
              {laggingPhases.map((phase) => {
                const details = [
                  phase.pendingApprovalCount
                    ? phase.pendingApprovalCount + (phase.pendingApprovalCount === 1
                      ? ' tarea esperando aprobación' : ' tareas esperando aprobación') : null,
                  phase.overdueCount
                    ? phase.overdueCount + (phase.overdueCount === 1 ? ' tarea vencida' : ' tareas vencidas') : null,
                  phase.unassignedCount
                    ? phase.unassignedCount + (phase.unassignedCount === 1
                      ? ' tarea por asignar' : ' tareas por asignar') : null,
                ].filter(Boolean);
                return <div className={styles.reason} key={phase.id}>
                  <span className={styles.teamIcon} style={{ background: style.color }}>
                    {style.sigla}
                  </span>
                  <div><b>{phase.name} <span className={styles.negative}>−{phase.gapPoints} pts</span></b>
                    <p>Debería ir en {percent(phase.expectedPercent)} y va en
                      {' '}{percent(phase.actualPercent)}{details.length ? '; ' + details.join(', ') : ''}.</p>
                  </div>
                </div>;
              })}
            </div>
          )}
          {progress.hasPlan && laggingPhases.length === 0 && (
            <p className={styles.onSchedule}>No hay fases atrasadas respecto de las fechas del plan.</p>
          )}
          {progress.paused && (
            <p className={styles.pause}>El proyecto está pausado y detiene el reloj:
              no se califica la diferencia como atraso mientras dure esta condición.</p>
          )}

          <div className={styles.tableWrap}>
            <table className={styles.breakdown}>
              <thead><tr>
                <th>Fase y bloque de trabajo</th>
                <th>HH</th>
                <th>Real vs plan a hoy</th>
                <th>Cómo avanza</th>
                <th title="El sistema conserva el consumo a nivel de equipo; no lo distribuye entre bloques sin evidencia.">HH consumidas</th>
              </tr></thead>
              <tbody>
                {progress.phases.map((phase) => (
                  <FragmentPhase key={phase.id} phase={phase} />
                ))}
              </tbody>
            </table>
            {progress.phases.length === 0 && (
              <p className={styles.empty}>Sin bloques de trabajo para este equipo.</p>
            )}
          </div>
          {(progress.unplannedBlockCount > 0 || progress.unlinkedTaskCount > 0) && (
            <p className={styles.caution}>
              {progress.unplannedBlockCount > 0
                ? progress.unplannedBlockCount + ' bloque(s) todavía sin HH estimadas. ' : ''}
              {progress.unlinkedTaskCount > 0
                ? progress.unlinkedTaskCount + ' tarea(s) sin bloque inequívoco: no se suman al avance de ningún bloque.' : ''}
            </p>
          )}
          <p className={styles.note}>
            Las HH consumidas muestran el costo y no mueven el avance: haber usado
            el 60% de las horas no significa llevar el 60% del trabajo.
            El detalle por bloque aparece como «—» porque el registro de horas
            no identifica un bloque de forma verificable.
          </p>
        </div>}
      </div>
    </Card>
  );
}

function FragmentPhase({ phase }: { phase: TeamProgress['phases'][number] }) {
  return <>
    <tr className={styles.phaseRow}>
      <td><b>Fase {phase.number}: {phase.name}</b></td>
      <td>{hours(phase.estimatedHours)}</td>
      <td><ProgressMiniTrack real={phase.actualPercent} planned={phase.expectedPercent} /></td>
      <td>{percent(phase.actualPercent)} real, {percent(phase.expectedPercent)} según plan</td>
      <td title="No atribuible por bloque">—</td>
    </tr>
    {phase.blocks.map((block) => <tr key={block.id}>
      <td><span className={styles.blockLabel}><span className={styles.blockDot} />{block.name}</span></td>
      <td>{hours(block.estimatedHours)}</td>
      <td><ProgressMiniTrack real={block.actualPercent} planned={block.expectedPercent} /></td>
      <td><BlockNote block={block} /></td>
      <td title="Consumo no atribuido inequívocamente a este bloque">—</td>
    </tr>)}
  </>;
}
