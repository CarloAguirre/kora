import { useMemo } from 'react';
import type { ProjectDetail } from '@kora/contracts';
import styles from './HistoricalPhaseZeroDetail.module.css';

type Entry = ProjectDetail['phaseZeroEntries'][number];
const hh = (hours: number) => hours.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const date = (iso: string) => iso.split('-').reverse().join('-');
const STATUS = { approved: 'Aprobada', pending: 'Pendiente', rejected: 'Rechazada' } as const;

/** Fase 0 es historia REAL: registros de tiempo, no tareas ni bloques nuevos.
 * Equipos inferidos por membresía actual se etiquetan como referenciales.
 */
export function HistoricalPhaseZeroDetail({ project }: { project: ProjectDetail }) {
  const grouped = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; inferred: boolean; entries: Entry[] }>();
    for (const entry of project.phaseZeroEntries) {
      const id = entry.teamId ?? 'unassigned';
      const item = groups.get(id) ?? {
        id, name: entry.teamName ?? (entry.teamId ? 'Equipo sin catálogo' : 'Sin equipo identificable'),
        inferred: false, entries: [],
      };
      item.entries.push(entry);
      if (entry.teamAttribution === 'current_membership') item.inferred = true;
      groups.set(id, item);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'es-CL'));
  }, [project.phaseZeroEntries]);
  const totals = useMemo(() => ({
    approved: project.phaseZeroEntries.filter((entry) => entry.status === 'approved')
      .reduce((sum, entry) => sum + entry.hours, 0),
    pending: project.phaseZeroEntries.filter((entry) => entry.status === 'pending')
      .reduce((sum, entry) => sum + entry.hours, 0),
    rejected: project.phaseZeroEntries.filter((entry) => entry.status === 'rejected')
      .reduce((sum, entry) => sum + entry.hours, 0),
  }), [project.phaseZeroEntries]);
  return (
    <section className={styles.phase} aria-label="Fase 0 · Prospecto y levantamiento">
      <header className={styles.header}>
        <span className={styles.phaseTag}>FASE 0</span>
        <strong>Prospecto y levantamiento</strong>
        <span className={styles.readonly}>Histórico · Solo lectura</span>
      </header>
      <div className={styles.headline}>
        <strong>{hh(project.phaseZeroHours)} HH consumidas</strong>
        <span>Antes de la planificación comercial</span>
      </div>
      <p className={styles.explanation}>
        Estas HH aprobadas ya están en el consumo y presupuesto histórico del proyecto.
        Los registros de abajo permiten auditar quién trabajó y en qué actividad.
        No son bloques operativos nuevos ni se suman nuevamente a las fases futuras.
      </p>
      <div className={styles.stats}>
        <span>{project.phaseZeroEntries.length} registros históricos</span>
        <span>Aprobadas: {hh(totals.approved)} HH</span>
        <span>Pendientes: {hh(totals.pending)} HH</span>
        {totals.rejected > 0 && <span>Rechazadas: {hh(totals.rejected)} HH</span>}
      </div>
      {project.phaseZeroEntriesTruncated && (
        <p className={styles.warning} role="status">
          Se muestran los 1.000 registros históricos más recientes. Consulta el historial completo en Registro de horas.
        </p>
      )}
      {grouped.length === 0 ? (
        <p className={styles.empty}>No hay registros individuales disponibles para desglosar la Fase 0.</p>
      ) : (
        <div className={styles.groups}>
          {grouped.map((group) => {
            const approved = group.entries.filter((item) => item.status === 'approved')
              .reduce((sum, item) => sum + item.hours, 0);
            const pending = group.entries.filter((item) => item.status === 'pending')
              .reduce((sum, item) => sum + item.hours, 0);
            return <details key={group.id} className={styles.group}>
              <summary>
                <span className={styles.arrow} aria-hidden="true">▸</span>
                <strong>{group.name}</strong>
                {group.inferred && <small title="Membresía actual; no existe una asignación histórica exacta en el registro">
                  Equipo actual (referencial)
                </small>}
                <span className={styles.totals}>{hh(approved)} HH aprobadas
                  {pending > 0 ? ' · ' + hh(pending) + ' HH pendientes' : ''}
                  {' · '}{group.entries.length} registros</span>
              </summary>
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead><tr>
                    <th>Fecha</th><th>Actividad / tarea registrada</th>
                    <th>Colaborador</th><th>Estado</th><th>HH</th>
                  </tr></thead>
                  <tbody>{group.entries.map((item) =>
                    <tr key={item.id}>
                      <td>{date(item.date)}</td>
                      <td>
                        <strong>{(item.taskName ?? item.activity) || 'Actividad sin nombre'}</strong>
                        {item.taskName && item.activity !== item.taskName &&
                          <small>{item.activity}</small>}
                        {item.description && <small>{item.description}</small>}
                      </td>
                      <td>{item.userName}</td>
                      <td><span className={styles[item.status]}>{STATUS[item.status]}</span></td>
                      <td className={styles.hours}>{hh(item.hours)}</td>
                    </tr>,
                  )}</tbody>
                </table>
              </div>
            </details>;
          })}
        </div>
      )}
      {grouped.some((group) => group.inferred) && (
        <p className={styles.footnote}>
          Los equipos indicados como referenciales corresponden a la única membresía actual
          identificable del colaborador; no se presume su pertenencia histórica.
        </p>
      )}
    </section>
  );
}
