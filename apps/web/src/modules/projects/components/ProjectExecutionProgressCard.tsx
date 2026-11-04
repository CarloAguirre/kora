import { useId, useMemo, useState } from 'react';
import type { ProjectExecutionBlock, ProjectExecutionPhase, ProjectExecutionProgress } from '../lib/project-execution-progress';
import { getTeamStyle } from '../utils/team-style';
import shared from './TeamProgressCard.module.css';
import styles from './ProjectExecutionProgressCard.module.css';

const hours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });
const percent = (value: number) => value.toLocaleString('es-CL') + '%';
const date = (value: string) => value.slice(8, 10) + '-' + value.slice(5, 7) + '-' + value.slice(0, 4);
const sameHours = (a: number, b: number) => Math.abs(a - b) < 0.01;

function MiniTrack({ real, expected }: { real: number; expected: number }) {
  return <div className={shared.miniTrack} role="img"
    aria-label={'Avance real ' + percent(real) + ', esperado ' + percent(expected)}>
    <span className={shared.miniFill} style={{ width: percent(real) }} />
    <span className={shared.miniTarget} style={{ left: percent(expected) }} />
  </div>;
}

function BlockExplanation({ block }: { block: ProjectExecutionBlock }) {
  if (block.estimatedHours <= 0) return <>HH del bloque sin definir</>;
  if (block.isClosed) return <>{block.approvedDelivery
    ? 'Cerrado por entrega aprobada' + (block.closedAt ? ' el ' + date(block.closedAt) : '')
    : block.closedAt ? 'Cerrado el ' + date(block.closedAt)
      : 'Bloque completado'}</>;
  return <> {hours(block.actualHours)} HH en tareas aprobadas;
    {' '}{percent(block.coveragePercent)} del bloque desglosado en tareas</>;
}

function PhaseRows({ phase }: { phase: ProjectExecutionPhase }) {
  return <>
    <tr className={shared.phaseRow}>
      <td><b>Fase {phase.number}: {phase.name}</b></td>
      <td>{phase.estimatedHours > 0 ? hours(phase.estimatedHours) : '—'}</td>
      <td>{phase.actualPercent != null && phase.expectedPercent != null
        ? <MiniTrack real={phase.actualPercent} expected={phase.expectedPercent} />
        : 'Sin plan'}</td>
      <td>{phase.actualPercent != null && phase.expectedPercent != null
        ? percent(phase.actualPercent) + ' real, ' + percent(phase.expectedPercent) + ' según plan'
        : 'Sin bloques con HH planificadas'}</td>
      <td>{hours(phase.consumedHours)} HH</td>
    </tr>
    {phase.blocks.map((block) => {
      const teamStyle = getTeamStyle(block.teamName);
      return <tr key={block.id}>
        <td><span className={styles.blockName}>
          <span className={styles.teamDot} style={{ backgroundColor: teamStyle.color }} />
          {block.name.toLocaleLowerCase('es').includes(block.teamName.toLocaleLowerCase('es'))
            ? block.name : block.name + ' · ' + block.teamName}
        </span></td>
        <td>{block.estimatedHours > 0 ? hours(block.estimatedHours) : '—'}</td>
        <td>{block.estimatedHours > 0
          ? <MiniTrack real={block.actualPercent} expected={block.expectedPercent} /> : 'Sin plan'}</td>
        <td><BlockExplanation block={block} /></td>
        <td>{hours(block.consumedHours)} HH</td>
      </tr>;
    })}
  </>;
}

/**
 * Ficha interna de proyecto: suma las HH de los mismos bloques operativos
 * utilizados por Avance del equipo y por las barras del Roadmap.
 * Nunca usa project.progress, que mide tareas y entregas de las fases
 * mediante otra fórmula y puede marcar avance antes de crear los bloques.
 */
export function ProjectExecutionProgressCard({ progress }: { readonly progress: ProjectExecutionProgress }) {
  const [expanded, setExpanded] = useState(true);
  const explanationId = useId();
  const actual = progress.actualPercent ?? 0;
  const expected = progress.expectedPercent ?? 0;
  const difference = Math.max(0, expected - actual);
  const state = !progress.hasPlan ? 'Sin plan' : progress.paused ? 'Pausado' :
    actual < expected ? 'Atrasado' : actual > expected ? 'Adelantado' : 'Al día';

  const phaseTotalsMatch = useMemo(() => progress.phases.every((phase) =>
    sameHours(phase.estimatedHours, phase.commercialHours)), [progress.phases]);
  const soldMatch = sameHours(progress.plannedHours, progress.soldHours);
  const planningDescription = !progress.hasPlan ? 'Sin HH definidas en los bloques de trabajo.' :
    'Plan actual: ' + progress.phases.length + (progress.phases.length === 1 ? ' fase, ' : ' fases, ') +
    progress.blocksCount + (progress.blocksCount === 1 ? ' bloque' : ' bloques') +
    ' de trabajo, con ' + hours(progress.plannedHours) + ' HH planificadas' +
    (soldMatch ? ', igual a las HH vendidas.' :
      ' frente a ' + hours(progress.soldHours) + ' HH vendidas.');

  return <div className={styles.root}>
    <div className={shared.heading}>
      <h2>Avance del proyecto</h2>
      <span className={[shared.status, state === 'Atrasado' ? shared.behind :
        state === 'Al día' || state === 'Adelantado' ? shared.onTrack : shared.neutral].join(' ')}>
        <span aria-hidden="true">●</span> {state}
      </span>
    </div>
    <div className={shared.summary}>
      <strong>{progress.hasPlan ? percent(actual) : '—'}</strong>
      <div>
        <b>del plan completado</b>
        <small>{progress.hasPlan
          ? 'A la fecha, el plan contemplaba ' + percent(expected) +
            ' de avance' + (difference > 0 ? '; faltan ' + difference + ' puntos por recuperar.' : '.')
          : 'El presupuesto comercial existe, pero faltan HH en el plan de bloques.'}</small>
      </div>
    </div>
    <div className={shared.timelineWrap}>
      <div className={shared.timeline} role="img"
        aria-label={progress.hasPlan
          ? 'Avance real ' + percent(actual) + '; plan a la fecha ' + percent(expected)
          : 'Sin plan operativo del proyecto'}>
        {progress.hasPlan && <>
          <span className={shared.actualFill} style={{ width: percent(actual) }} />
          {difference > 0 && <span className={shared.pendingFill}
            style={{ left: percent(actual), width: percent(difference) }} />}
          <span className={shared.expectedLine} style={{ left: percent(expected) }} />
        </>}
      </div>
      {progress.hasPlan && <span className={shared.targetLabel}
        style={{ left: percent(expected), transform: expected <= 10 ? 'translateX(0)' :
          expected >= 90 ? 'translateX(-100%)' : 'translateX(-50%)' }}>
        Plan a la fecha: {percent(expected)}
      </span>}
    </div>
    <p className={styles.planDescription}>{planningDescription}</p>
    <div className={shared.explainer}>
      <button type="button" className={shared.toggle} aria-expanded={expanded}
        aria-controls={explanationId} onClick={() => setExpanded((value) => !value)}>
        <span className={shared.chevron} aria-hidden="true">{expanded ? '⌄' : '›'}</span>
        ¿Cómo se calcula este avance?
      </button>
      {expanded && <div id={explanationId} className={shared.explanation}>
        {progress.hasPlan
          ? <p className={shared.lead}>Hoy deberías llevar <b>{percent(expected)}</b>: según las fechas
            de los bloques de trabajo, a hoy deberían estar completadas
            {' '}<b>{hours(progress.expectedHours)}</b> de las
            {' '}<b>{hours(progress.plannedHours)} HH</b> planificadas.
            Llevas <b>{percent(actual)}</b>, es decir,
            {' '}<b>{hours(progress.actualHours)} HH</b> completadas.</p>
          : <p className={shared.lead}>Todavía no es posible medir el avance del proyecto:
              las HH vendidas no sustituyen las HH y fechas de los bloques operativos.
              Completa el Roadmap para establecer el plan.</p>}
        <div className={shared.methodology}>
          <div><b>1. El plan</b><p>Son las HH de los bloques de trabajo:
            {' '}{hours(progress.plannedHours)} HH equivalen al 100% del plan operativo.
            Se distribuyen entre sus fechas de inicio y fin.</p></div>
          <div><b>2. Las tareas</b><p>Cada tarea <b>aprobada</b> aporta sus HH estimadas
            al avance de su bloque; sin aprobación aún no suma avance.</p></div>
          <div><b>3. La entrega</b><p>Una entrega de cierre <b>aprobada</b> o el cierre
            registrado completa ese bloque al 100%.</p></div>
        </div>

        {progress.laggingBlocks.length > 0 && !progress.paused && <div className={shared.reasons}>
          <strong>Qué explica la diferencia</strong>
          {progress.laggingBlocks.map((block) => {
            const team = getTeamStyle(block.teamName);
            const explanations = [
              block.pendingApprovalCount > 0 ? block.pendingApprovalCount +
                (block.pendingApprovalCount === 1 ? ' tarea esperando aprobación' : ' tareas esperando aprobación') : null,
              block.overdueCount > 0 ? block.overdueCount +
                (block.overdueCount === 1 ? ' tarea vencida' : ' tareas vencidas') : null,
              block.unassignedCount > 0 ? block.unassignedCount +
                (block.unassignedCount === 1 ? ' tarea por asignar' : ' tareas por asignar') : null,
            ].filter(Boolean);
            return <div className={shared.reason} key={block.id}>
              <span className={shared.teamIcon} style={{ background: team.color }}>{team.sigla}</span>
              <div>
                <b>{block.teamName} · {block.phaseName} <span className={shared.negative}>
                  −{block.gapPoints} pts</span></b>
                <p>Debería ir en {percent(block.expectedPercent)} y va en
                  {' '}{percent(block.actualPercent)}
                  {explanations.length > 0 ? '; ' + explanations.join(', ') : ''}.</p>
              </div>
            </div>;
          })}
        </div>}
        {progress.paused && <p className={shared.pause}>El proyecto detiene el reloj:
          no se califica la diferencia como atraso mientras dure la pausa.</p>}
        {progress.hasPlan && progress.laggingBlocks.length === 0 && !progress.paused &&
          <p className={shared.onSchedule}>No hay bloques atrasados respecto del plan.</p>}

        <div className={shared.tableWrap}>
          <table className={shared.breakdown}>
            <thead><tr>
              <th>Fase y bloque de trabajo</th>
              <th>HH</th>
              <th>Real vs plan a hoy</th>
              <th>Cómo avanza</th>
              <th title="Solo registros aprobados con segmento explícito">HH consumidas</th>
            </tr></thead>
            <tbody>{progress.phases.map((phase) =>
              <PhaseRows key={phase.id} phase={phase} />)}</tbody>
          </table>
          {progress.phases.length === 0 &&
            <p className={shared.empty}>El proyecto todavía no tiene fases operativas.</p>}
        </div>
        {(progress.unplannedBlockCount > 0 || progress.unlinkedTaskCount > 0 ||
          !phaseTotalsMatch || !soldMatch) && <p className={shared.caution}>
          {progress.unplannedBlockCount > 0
            ? progress.unplannedBlockCount + ' bloque(s) sin HH estimadas. ' : ''}
          {!phaseTotalsMatch || !soldMatch
            ? 'Las HH de bloques no coinciden con la estimación comercial; revisa el Roadmap. ' : ''}
          {progress.unlinkedTaskCount > 0
            ? progress.unlinkedTaskCount + ' tarea(s) sin bloque inequívoco; no generan avance.' : ''}
        </p>}
        <p className={shared.note}>Las HH consumidas por bloque son registros aprobados
          atribuidos expresamente a ese segmento. El historial sin vínculo se conserva
          en el consumo global del proyecto: el costo no representa porcentaje de
          trabajo completado.</p>
      </div>}
    </div>
  </div>;
}
