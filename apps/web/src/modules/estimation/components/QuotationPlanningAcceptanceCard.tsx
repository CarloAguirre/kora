import type { QuotationVersion } from '@kora/contracts';
import { Card } from '@/shared/components/ui/Card';
import { buildReferenceDailyPlan, referenceDailyPlanCsv } from '../lib/quotation-reference-daily-plan';
import styles from './QuotationPlanningAcceptanceCard.module.css';

const fmt = (hours: number) => hours.toLocaleString('es-CL', { maximumFractionDigits: 2 });

/**
 * La EDT es el origen del desglose: HH por actividad y rol, módulo y tramo.
 * Compatible con cotizaciones Gemini v1 sin roleEffort / stages.
 * Solo es un borrador comercial, nunca ejecución ni asignación nominal.
 */
export function QuotationPlanningAcceptanceCard({
  version, teamNames, roleTeamIds,
}: {
  version: QuotationVersion;
  teamNames?: ReadonlyMap<string, string>;
  roleTeamIds?: Readonly<Record<string, string>>;
}) {
  const edt = version.draft.aiPoc?.edt;
  if (!edt) return null;
  const detailed = edt.schemaVersion === 'kora.quotation.reference-edt.v2';
  const stages = detailed ? edt.stages ?? [] : [];
  const reserve = detailed ? edt.reserveHours ?? 0 : 0;
  const mapping = roleTeamIds ?? version.draft.aiPoc?.roleTeamIds ?? {};
  const mappedName = (role: string) => {
    const teamId = mapping[role];
    if (!teamId || !teamNames) return null;
    return teamNames.get(teamId) ?? 'Equipo no disponible';
  };
  const dailyPlan = detailed && version.draft.aiPoc
    ? buildReferenceDailyPlan(edt, version.draft.aiPoc.proposal.roles)
    : null;
  const exportDailyPlan = () => {
    if (!dailyPlan || dailyPlan.issues.length > 0) return;
    const csv = referenceDailyPlanCsv(dailyPlan, (role) => mappedName(role) ?? role);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plan-diario-referencial-v' + version.versionNumber + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return (
    <Card>
      <div className={styles.head}>
        <div>
          <h2>EDT de referencia · Gemini</h2>
          <p>{detailed
            ? 'Estimación detallada del alcance KDM: cada actividad tiene HH por perfil y pertenece a un tramo cronológico.'
            : 'Desglose KDM legado. Las HH por tarea se distribuyeron desde los perfiles de la propuesta original.'}</p>
        </div>
        <strong>{fmt(edt.totalHours)} HH base</strong>
      </div>
      {detailed && (
        <div className={styles.totals}>
          <div><span>Horas base</span><strong>{fmt(edt.totalHours)} HH</strong></div>
          <div><span>Reserva ({fmt(edt.reservePercent ?? 0)}%)</span>
            <strong>{fmt(reserve)} HH</strong></div>
          <div><span>Base + reserva</span>
            <strong>{fmt(edt.totalWithReserve ?? edt.totalHours)} HH</strong></div>
        </div>
      )}
      {stages.length > 0 && (
        <div className={styles.stageSection}>
          <h3>Tramos propuestos</h3>
          <p>Semanas relativas de referencia. El cronograma operativo se confirma después de la aprobación.</p>
          <div className={styles.stageList}>
            {stages.map((stage) => (
              <div className={styles.stage} key={stage.code}>
                <span className={styles.stageCode}>{stage.code}</span>
                <span className={styles.stageText}><strong>{stage.name}</strong>
                  <small>Semanas {stage.startWeek}–{stage.startWeek + stage.durationWeeks - 1}</small>
                </span>
                <strong>{fmt(stage.totalHours)} HH</strong>
              </div>
            ))}
          </div>
        </div>
      )}
      {dailyPlan && (
        <details className={styles.dailyPlan}>
          <summary>
            <span>Plan diario de referencia</span>
            <small>{dailyPlan.rows.length} asignaciones · {dailyPlan.dayCount} días hábiles relativos
              {' · '}{fmt(dailyPlan.plannedHours)} / {fmt(dailyPlan.sourceHours)} HH</small>
          </summary>
          <div className={styles.dailyBody}>
            <p>
              Distribución matemática de las HH de Gemini por actividad y perfil,
              dentro de las semanas propuestas. Sin fechas reales, responsables nominales,
              dependencias aprobadas ni impacto en Forecast.
              Capacidad máxima de 8 HH por persona/día, ajustada a la dedicación propuesta.
            </p>
            {dailyPlan.issues.length > 0 && (
              <div role="alert" className={styles.dailyIssues}>
                <strong>Distribución incompleta: {fmt(dailyPlan.pendingHours)} HH pendientes.</strong>
                <ul>{dailyPlan.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
                <p>Revisar semanas, duración o capacidad antes de considerar este plan viable.</p>
              </div>
            )}
            <div className={styles.dailyActions}>
              <button type="button" onClick={exportDailyPlan}
                disabled={dailyPlan.issues.length > 0}>
                Exportar Plan_Diario (CSV)
              </button>
              <small>
                Estructura equivalente al Excel Zurich; la columna Fecha queda vacía.
              </small>
            </div>
            <div className={styles.dailyScroll}>
              <table>
                <thead><tr>
                  <th>Día</th><th>Tramo</th><th>Equipo / perfil</th>
                  <th>Actividad WBS</th><th>Actividad</th><th>HH</th>
                </tr></thead>
                <tbody>
                  {dailyPlan.rows.slice(0, 70).map((row, index) => (
                    <tr key={row.day + '-' + row.wbs + '-' + row.role + '-' + index}>
                      <td>{row.day}</td>
                      <td>{row.stageCode}</td>
                      <td>{mappedName(row.role) ?? row.role}</td>
                      <td>{row.wbs}</td>
                      <td>{row.activity}</td>
                      <td className={styles.dailyHours}>{fmt(row.hours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {dailyPlan.rows.length > 70 &&
              <p>Vista limitada a 70 asignaciones. Exporta el CSV para verlas todas.</p>}
          </div>
        </details>
      )}
      <p className={styles.notice}>
        La EDT permanece en la versión comercial hasta su aprobación y traspaso.
        Sus tareas no tienen responsables nominales ni fechas comprometidas.
      </p>
      <div className={styles.modules}>
        {edt.modules.map((module, index) => {
          const effortByRole = new Map<string, number>();
          for (const task of module.tasks) {
            for (const item of task.roleEffort ?? [{ role: task.role, hours: task.hours }]) {
              effortByRole.set(item.role, Math.round(((effortByRole.get(item.role) ?? 0) + item.hours) * 100) / 100);
            }
          }
          const effortByTeam = new Map<string, number>();
          for (const [role, hours] of effortByRole) {
            const label = mappedName(role);
            if (label) effortByTeam.set(label,
              Math.round(((effortByTeam.get(label) ?? 0) + hours) * 100) / 100);
          }
          return (
            <details key={index} className={styles.module}>
              <summary className={styles.moduleHeader}>
                <span className={styles.moduleIndex}>{String(index + 1).padStart(2, '0')}</span>
                <span className={styles.moduleTitle}>
                  <strong>{module.name}</strong>
                  <small>{module.tasks.length} {module.tasks.length === 1 ? 'actividad' : 'actividades'}
                    {' · '}{effortByRole.size} {effortByRole.size === 1 ? 'perfil' : 'perfiles'}
                    {' · '}Pulsa para ver desglose</small>
                </span>
                <span className={styles.moduleHours}>{fmt(module.totalHours)} HH</span>
                <span className={styles.chevron} aria-hidden="true" />
              </summary>
              <div className={styles.moduleBody}>
                <div className={styles.moduleRoles} aria-label={'Distribución por perfil en ' + module.name}>
                  {[...effortByRole].map(([role, hours]) => (
                    <div key={role}><span>{role}{mappedName(role) ? ' · ' + mappedName(role) : ''}</span>
                      <strong>{fmt(hours)} HH</strong></div>
                  ))}
                </div>
                {effortByTeam.size > 0 && (
                  <div className={styles.teamTotals} aria-label={'HH por equipo del módulo ' + module.name}>
                    {[...effortByTeam].map(([name, hours]) => (
                      <span key={name}>{name}: <strong>{fmt(hours)} HH</strong></span>
                    ))}
                  </div>
                )}
                {module.tasks.map((task) => (
                  <details key={task.wbs} className={styles.task}>
                    <summary className={styles.taskHeader}>
                      <span className={styles.taskCode}>{task.wbs}</span>
                      <span className={styles.taskTitle}>{task.name}</span>
                      <span className={styles.taskHours}>{fmt(task.hours)} HH</span>
                      <span className={styles.chevron} aria-hidden="true" />
                    </summary>
                    <div className={styles.taskBody}>
                      {task.stageCode && <p className={styles.meta}>Tramo: {task.stageCode}
                        {task.submodule ? ' · Submódulo: ' + task.submodule : ''}</p>}
                      <p>{task.description?.trim() || 'No se aportó una descripción adicional para esta actividad.'}</p>
                      <div className={styles.taskRoleEffort}>
                        {(task.roleEffort ?? [{ role: task.role, hours: task.hours }]).map((part) => (
                          <span key={part.role} className={styles.role}>
                            {part.role}{mappedName(part.role) ? ' · ' + mappedName(part.role) : ''}: {fmt(part.hours)} HH
                          </span>
                        ))}
                      </div>
                      {task.referenceIds && task.referenceIds.length > 0 &&
                        <p className={styles.meta}>Referencias: {task.referenceIds.join(', ')}</p>}
                      {task.classification &&
                        <p className={styles.meta}>Clasificación: {task.classification}</p>}
                      <small>HH de referencia sujetas a revisión técnica y comercial.</small>
                    </div>
                  </details>
                ))}
              </div>
            </details>
          );
        })}
      </div>
      <p className={styles.notice}>
        Aceptar la propuesta IA no traspasa la EDT ni materializa actividades.
        El traspaso requiere aprobación del cliente.
      </p>
    </Card>
  );
}
