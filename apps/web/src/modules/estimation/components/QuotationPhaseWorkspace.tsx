import type { QuotationDraftData, QuotationReferenceEdt } from '@kora/contracts';
import { Card } from '@/shared/components/ui/Card';
import styles from './QuotationPhaseWorkspace.module.css';

type Phase = QuotationDraftData['phases'][number];
type Team = QuotationDraftData['teams'][number];

const hh = (value: number) =>
  value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

export function quotationTeamColor(name: string): string {
  const normalized = name.toLocaleLowerCase('es');
  if (normalized.includes('desarrollo') || normalized.includes('dev')) return '#f97316';
  if (normalized.includes('qa') || normalized.includes('calidad')) return '#3b82f6';
  if (normalized.includes('ux') || normalized.includes('diseño')) return '#16a05c';
  if (normalized.includes('pmo') || normalized.includes('gestión')) return '#64748b';
  if (normalized.includes('rpa')) return '#15a6a5';
  if (normalized === 'ia' || normalized.includes('inteligencia')) return '#e05272';
  return '#6875ae';
}

interface ReferenceTaskRow {
  wbs: string;
  name: string;
  module: string;
  description: string;
  role: string;
  team: string;
  hours: number;
  classification: string | undefined;
  references: string[];
}

/** Solo lectura: la EDT original no tiene atributos comerciales 'tipo de catálogo'
 * ni 'fija'. Mostrarla como editable duplicaría la fuente de HH sin contrato de
 * conciliación y permitiría aprobar una versión distinta a la proyectada. */
export function referenceTasksForPhase(
  phase: Phase, edt: QuotationReferenceEdt | null | undefined,
  mapping: Readonly<Record<string, string>>,
  teamNames: ReadonlyMap<string, string>,
): ReferenceTaskRow[] {
  if (!edt) return [];
  const stage = edt.stages?.find((item) =>
    phase.name === item.code + ' · ' + item.name ||
    phase.name.startsWith(item.code + ' · '));
  const isLegacy = edt.schemaVersion === 'kora.quotation.reference-edt.v1';
  const result: ReferenceTaskRow[] = [];
  for (const module of edt.modules) {
    for (const task of module.tasks) {
      if (stage ? task.stageCode !== stage.code :
        !isLegacy || (phase.name !== module.name && phase.name !== task.role)) continue;
      const efforts = task.roleEffort ?? [{ role: task.role, hours: task.hours }];
      for (const part of efforts) {
        result.push({
          wbs: task.wbs,
          name: task.name,
          module: module.name,
          description: task.description,
          role: part.role,
          team: teamNames.get(mapping[part.role] ?? '') ?? part.role,
          hours: part.hours,
          classification: task.classification,
          references: task.referenceIds ?? [],
        });
      }
    }
  }
  return result;
}

/** El preview se obtiene exclusivamente de la EDT guardada. No crea fases ni
 * reemplaza la asignación real por equipos: no hay escrituras ni llamadas IA. */
export function referencePhasesFromEdt(
  edt: QuotationReferenceEdt,
  mapping: Readonly<Record<string, string>>,
  teamNames: ReadonlyMap<string, string>,
): Phase[] {
  const isV2 = edt.schemaVersion === 'kora.quotation.reference-edt.v2';
  const entries = isV2
    ? (edt.stages ?? []).map((stage) => ({
      name: stage.code + ' · ' + stage.name,
      startWeek: stage.startWeek,
      durationWeeks: stage.durationWeeks,
      tasks: edt.modules.flatMap((module) => module.tasks)
        .filter((task) => task.stageCode === stage.code),
    }))
    : edt.modules.map((module) => ({
      name: module.name,
      startWeek: 1,
      durationWeeks: 1,
      tasks: module.tasks,
    }));
  return entries.map((entry) => {
    const byRoleOrTeam = new Map<string, number>();
    for (const task of entry.tasks) {
      for (const effort of task.roleEffort ?? [{ role: task.role, hours: task.hours }]) {
        const teamId = mapping[effort.role];
        const key = teamId && teamNames.has(teamId) ? teamId : 'profile:' + effort.role;
        byRoleOrTeam.set(key, Math.round(((byRoleOrTeam.get(key) ?? 0) + effort.hours) * 100) / 100);
      }
    }
    return {
      name: entry.name,
      startWeek: entry.startWeek,
      durationWeeks: entry.durationWeeks,
      teamHours: [...byRoleOrTeam].map(([teamId, hours]) => ({ teamId, hours })),
    };
  });
}

export function QuotationPhaseWorkspace({
  phases, teams, teamNames, edt, roleTeamIds, editable,
  commercialMode = 'phases', onEditPhase, onAddPhase, onRemovePhase,
}: {
  phases: readonly Phase[];
  teams: readonly Team[];
  teamNames: ReadonlyMap<string, string>;
  edt?: QuotationReferenceEdt | null;
  roleTeamIds?: Readonly<Record<string, string>>;
  editable: boolean;
  commercialMode?: QuotationDraftData['mode'];
  onEditPhase: (index: number, patch: Partial<Phase>) => void;
  onAddPhase: () => void;
  onRemovePhase: (index: number) => void;
}) {
  const mapping = roleTeamIds ?? {};
  // Una cotización IA recién creada conserva la EDT, pero aún no tiene
  // fases comerciales. Renderizar la evidencia antes de mapear perfiles.
  const previewOnly = Boolean(edt && (phases.length === 0 || commercialMode !== 'phases'));
  const displayPhases = previewOnly && edt
    ? referencePhasesFromEdt(edt, mapping, teamNames) : phases;
  const nameOf = (teamId: string) => teamId.startsWith('profile:')
    ? teamId.slice('profile:'.length)
    : teamNames.get(teamId) ?? 'Equipo no disponible';
  const maxWeek = Math.max(1, ...displayPhases.map((phase) =>
    phase.startWeek + phase.durationWeeks - 1));

  return (
    <Card className={styles.surface}>
      <div className={styles.head}>
        <h2>Fases · Módulos</h2>
        <p>En semanas desde el inicio · Fase 1 la crea Kora</p>
      </div>
      {previewOnly && <div className={styles.previewNotice} role="status">
        <strong>✦ Planificación propuesta por Gemini · {hh(edt?.totalHours ?? 0)} HH</strong>
        <span>Vista de referencia, aún no guardada como distribución comercial.
          Puedes revisar los módulos, las tareas y el roadmap sin generar otra cotización.</span>
        <a href="#quotation-ai-role-review">Asignar perfiles a equipos de Kora y aplicar propuesta</a>
      </div>}

      <div className={styles.phases}>
        {displayPhases.map((phase, index) => {
          const total = phase.teamHours.reduce((sum, row) => sum + row.hours, 0);
          const tasks = referenceTasksForPhase(phase, edt, mapping, teamNames);
          const taskTotal = tasks.reduce((sum, row) => sum + row.hours, 0);
          const uniqueTasks = new Set(tasks.map((task) => task.wbs)).size;
          return (
            <section className={styles.phase} key={index} aria-label={'Fase ' + (index + 2)}>
              <div className={styles.phaseHeader}>
                <span className={styles.phaseBadge}>Fase {index + 2}</span>
                <span className={styles.phaseDescription}>
                  {hh(total)} HH · semanas {phase.startWeek} a {phase.startWeek + phase.durationWeeks - 1}
                </span>
                {editable && !previewOnly && <button className={styles.remove} type="button"
                  onClick={() => {
                    if (window.confirm('¿Eliminar esta fase comercial y sus HH distribuidas?'))
                      onRemovePhase(index);
                  }}>Eliminar</button>}
              </div>

              <div className={styles.phaseFields}>
                <label>Nombre del módulo
                  <input value={phase.name} disabled={!editable || previewOnly} maxLength={300}
                    onChange={(event) => onEditPhase(index, { name: event.target.value })} />
                </label>
                <label>Semana de inicio
                  <input type="number" min={1} max={520} value={phase.startWeek} disabled={!editable || previewOnly}
                    onChange={(event) => onEditPhase(index, {
                      startWeek: Math.max(1, Number(event.target.value) || 1),
                    })} />
                </label>
                <label>Duración (semanas)
                  <input type="number" min={1} max={520} value={phase.durationWeeks} disabled={!editable || previewOnly}
                    onChange={(event) => onEditPhase(index, {
                      durationWeeks: Math.max(1, Number(event.target.value) || 1),
                    })} />
                </label>
              </div>

              <div className={styles.phaseTeams}>
                {(previewOnly ? phase.teamHours.map((item) => ({ teamId: item.teamId })) : teams).map((team) => {
                  const name = nameOf(team.teamId);
                  return (
                    <label key={team.teamId}>
                      <span><i style={{ background: quotationTeamColor(name) }} />{name} · HH</span>
                      <input type="number" min={0} step="0.01" disabled={!editable || previewOnly}
                        aria-label={'HH de ' + name + ' para fase ' + (index + 2)}
                        value={phase.teamHours.find((item) => item.teamId === team.teamId)?.hours ?? 0}
                        onChange={(event) => onEditPhase(index, {
                          teamHours: [
                            ...phase.teamHours.filter((item) => item.teamId !== team.teamId),
                            { teamId: team.teamId, hours: Math.max(0, Number(event.target.value) || 0) },
                          ],
                        })} />
                    </label>
                  );
                })}
                {!previewOnly && teams.length === 0 &&
                  <p className={styles.empty}>Asigna equipos antes de distribuir las HH por módulo.</p>}
              </div>

              {edt && (
                <details className={styles.tasks}>
                  <summary>
                    <strong>Tareas</strong>
                    <span>{uniqueTasks} {uniqueTasks === 1 ? 'tarea' : 'tareas'}
                      {uniqueTasks > 0 && ' · ' + hh(taskTotal) + ' HH'}</span>
                  </summary>
                  {tasks.length ? (
                    <>
                      <p className={styles.hint}>
                        Desglose original de Gemini, conservado por WBS y perfil. La distribución
                        comercial se edita arriba; las tareas aún no tienen tipo de catálogo ni indicador «Fija».
                      </p>
                      {!previewOnly && Math.abs(taskTotal - total) > 0.011 && (
                        <p role="status" className={styles.mismatch}>
                          La fase comercial suma {hh(total)} HH y la EDT de referencia {hh(taskTotal)} HH.
                          Revisa la conciliación antes de aprobar.
                        </p>
                      )}
                      <div className={styles.tableScroll}>
                        <div className={styles.tasksHeader}>
                          <span>Tarea</span><span>Equipo</span><span>Tipo (catálogo)</span>
                          <span>HH</span><span>Fija</span>
                        </div>
                        {tasks.map((task, taskIndex) => (
                          <div className={styles.taskRow}
                            key={task.wbs + ':' + task.role + ':' + taskIndex}>
                            <div className={styles.taskName}>
                              <div className={styles.readonlyInput} title={task.description}>
                                {task.name}
                              </div>
                              <small>✦ Propuesta del agente · {task.wbs} · {task.module}</small>
                            </div>
                            <div className={styles.readonlyInput} title={'Perfil de Gemini: ' + task.role}>
                              {task.team}
                            </div>
                            <div className={styles.readonlyInput} title="Sin clasificación de catálogo confirmada">
                              {task.classification || 'Por catalogar'}
                            </div>
                            <div className={styles.readonlyInput + ' ' + styles.readonlyHours}>
                              {hh(task.hours)}
                            </div>
                            <label className={styles.fixedField} title="El indicador Fija no existe todavía en el contrato comercial">
                              <input type="checkbox" disabled
                                aria-label={'Fija no disponible para ' + task.wbs} />
                            </label>
                            {(task.description || task.references.length > 0) && (
                              <details className={styles.taskDescription}>
                                <summary>Descripción y referencias</summary>
                                {task.description && <p>{task.description}</p>}
                                {task.references.length > 0 &&
                                  <p>Referencias: {task.references.join(', ')}</p>}
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                      <a className={styles.edtLink} href="#quotation-edt-reference">
                        Ver EDT detallada de Gemini
                      </a>
                    </>
                  ) : (
                    <p className={styles.hint}>
                      Las tareas originales no están asociadas a esta fase comercial.
                      Puedes consultarlas en la EDT de referencia.
                    </p>
                  )}
                </details>
              )}
            </section>
          );
        })}
        {displayPhases.length === 0 &&
          <p className={styles.empty}>No hay tramos cronológicos en esta versión.</p>}
      </div>

      {editable && !previewOnly && <button className={styles.add} type="button" onClick={onAddPhase}>
        + Agregar fase / módulo
      </button>}

      {displayPhases.length > 0 && (
        <section className={styles.roadmap} aria-labelledby="quotation-roadmap-title">
          <div className={styles.head}>
            <h3 id="quotation-roadmap-title">Roadmap preliminar</h3>
            <p>Las fechas se fijan con la fecha de inicio del proyecto</p>
          </div>
          <div className={styles.timeline}>
            {displayPhases.map((phase, index) => {
              const total = phase.teamHours.reduce((sum, row) => sum + row.hours, 0);
              return (
                <div className={styles.timelineRow} key={index}>
                  <span title={phase.name}>Fase {index + 2} · {phase.name}</span>
                  <div className={styles.timelineTrack}
                    aria-label={phase.name + ', semanas ' + phase.startWeek +
                      ' a ' + (phase.startWeek + phase.durationWeeks - 1)}>
                    <div className={styles.timelineBar} style={{
                      left: ((phase.startWeek - 1) / maxWeek * 100) + '%',
                      width: (phase.durationWeeks / maxWeek * 100) + '%',
                    }}>
                      {total > 0 && phase.teamHours.filter((item) => item.hours > 0).map((item) => {
                        const name = nameOf(item.teamId);
                        return <span key={item.teamId}
                          style={{ width: (item.hours / total * 100) + '%',
                            background: quotationTeamColor(name) }}
                          title={name + ' · ' + hh(item.hours) + ' HH'} />;
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
            <div className={styles.axis}><span>Semana 1</span><span>Semana {maxWeek}</span></div>
          </div>
        </section>
      )}
    </Card>
  );
}
