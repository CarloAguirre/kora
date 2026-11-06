import type { QuotationDraftData, QuotationReferenceEdt } from '@kora/contracts';
import { quotationEdtAssignments } from '@kora/contracts';
import { Card } from '@/shared/components/ui/Card';
import { quotationTeamColor } from './quotation-team-colors';
import { QuotationGroupHoursInput } from './QuotationGroupHoursInput';
import { downloadQuotationTaskTemplate } from '../lib/quotation-task-excel';
import styles from './QuotationPhaseWorkspace.module.css';

type Phase = QuotationDraftData['phases'][number];
type Team = QuotationDraftData['teams'][number];
type TaskRow = {
  wbs: string; name: string; module: string; stageCode?: string | null; description: string;
  role: string; team: string; teamKey: string; teamId: string | null;
  fixed: boolean; hours: number; references: string[]; classification?: string;
};
const hh = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
export { quotationTeamColor } from './quotation-team-colors';
const nameOf = (key: string, names: ReadonlyMap<string, string>) =>
  key.startsWith('profile:') ? 'Pendiente · ' + key.slice('profile:'.length) :
    names.get(key) ?? 'Equipo no disponible';

/** La misma relación WBS×perfil se usa en ambas vistas. No se contabilizan
 * roles dos veces cuando participan en una misma actividad. */
export function referenceTasksForPhase(
  phase: Phase, edt: QuotationReferenceEdt | null | undefined,
  mapping: Readonly<Record<string, string>>,
  teamNames: ReadonlyMap<string, string>,
  draft?: QuotationDraftData,
): TaskRow[] {
  if (!edt) return [];
  const stage = edt.stages?.find((item) => phase.name.startsWith(item.code + ' · ')) ??
    draft?.edtCommercialStages?.find((item) => phase.name.startsWith(item.code + ' · '));
  if (draft) return quotationEdtAssignments(draft)
    .filter((task) => {
      if (stage) return task.stageCode === stage.code;
      const originalName = draft.edtStageSettings?.find((setting) =>
        setting.stageCode.startsWith('module:') &&
        setting.name === phase.name)?.stageCode.slice(7);
      return edt.schemaVersion === 'kora.quotation.reference-edt.v1' &&
        (task.module === (originalName ?? phase.name) ||
         task.stageCode === 'module:' + (originalName ?? phase.name) ||
         task.role === phase.name);
    })
    .map((task) => ({
      ...task, team: nameOf(task.teamKey, teamNames),
    }));
  const rows: TaskRow[] = [];
  for (const module of edt.modules) for (const task of module.tasks) {
    if (stage ? task.stageCode !== stage.code :
      edt.schemaVersion !== 'kora.quotation.reference-edt.v1' ||
      (phase.name !== module.name && phase.name !== task.role)) continue;
    for (const effort of task.roleEffort ?? [{ role: task.role, hours: task.hours }]) {
      const teamId = mapping[effort.role] ?? null;
      rows.push({
        wbs: task.wbs, role: effort.role, name: task.name, module: module.name,
        description: task.description, stageCode: task.stageCode ?? null,
        hours: effort.hours, references: task.referenceIds ?? [],
        classification: task.classification,
        teamId, teamKey: teamId ?? 'profile:' + effort.role, fixed: false,
        team: teamId ? nameOf(teamId, teamNames) : effort.role,
      });
    }
  }
  return rows;
}

/** Vista referencial: toma semanas de Gemini y enmiendas comerciales guardadas,
 * agrupando por equipo real o por perfil aún no asignado. */
export function referencePhasesFromEdt(
  edt: QuotationReferenceEdt,
  mapping: Readonly<Record<string, string>>,
  teamNames: ReadonlyMap<string, string>,
  draft?: QuotationDraftData,
): Phase[] {
  const v2 = edt.schemaVersion === 'kora.quotation.reference-edt.v2';
  const entries = [...(v2 ? (edt.stages ?? []).map((s) => ({
    code: s.code, name: s.name, startWeek: s.startWeek,
    durationWeeks: s.durationWeeks,
    match: (row: TaskRow) => row.stageCode === s.code,
  })) : edt.modules.map((m) => ({
    code: 'module:' + m.name, name: m.name, startWeek: 1, durationWeeks: 1,
    match: (row: TaskRow) => row.module === m.name ||
      row.stageCode === 'module:' + m.name,
  }))), ...(draft?.edtCommercialStages ?? []).map((s) => ({
    code: s.code, name: s.name, startWeek: s.startWeek,
    durationWeeks: s.durationWeeks,
    match: (row: TaskRow) => row.stageCode === s.code,
  }))];
  const all = draft
    ? quotationEdtAssignments(draft).map((row) => ({
        ...row, team: nameOf(row.teamKey, teamNames),
      }))
    : edt.modules.flatMap((m) => m.tasks.flatMap((task) =>
        (task.roleEffort ?? [{ role: task.role, hours: task.hours }]).map((effort) => {
          const teamId = mapping[effort.role] ?? null;
          return {
            wbs: task.wbs, role: effort.role, module: m.name, name: task.name,
            description: task.description, references: task.referenceIds ?? [],
            hours: effort.hours, fixed: false, teamId,
            teamKey: teamId ?? 'profile:' + effort.role,
            team: teamId ? nameOf(teamId, teamNames) : effort.role,
          };
        })));
  return entries.map((entry) => {
    const edited = draft?.edtStageSettings?.find((s) => s.stageCode === entry.code);
    const grouped = new Map<string, number>();
    for (const row of all.filter(entry.match)) {
      grouped.set(row.teamKey, Math.round(
        ((grouped.get(row.teamKey) ?? 0) + row.hours) * 100) / 100);
    }
    return {
      name: (v2 ? entry.code + ' · ' : '') + (edited?.name ?? entry.name),
      startWeek: edited?.startWeek ?? entry.startWeek,
      durationWeeks: edited?.durationWeeks ?? entry.durationWeeks,
      teamHours: [...grouped].map(([teamId, hours]) => ({ teamId, hours })),
    };
  });
}

export function QuotationPhaseWorkspace({
  phases, teams, teamNames, edt, roleTeamIds, editable,
  commercialMode = 'phases', draft, activeTeams = [],
  onEditPhase, onAddPhase, onRemovePhase,
  onEditTaskHours, onEditTaskFixed, onEditTaskTeam, onEditGroupHours,
  onEditStage, onOpenRoleMapping,
  onAddTask, onDeleteTask, onEditTaskName,
  onImportTaskExcel, onRemoveCommercialPhase,
}: {
  phases: readonly Phase[];
  teams: readonly Team[];
  teamNames: ReadonlyMap<string, string>;
  edt?: QuotationReferenceEdt | null;
  draft?: QuotationDraftData;
  activeTeams?: readonly { id: string; name: string }[];
  roleTeamIds?: Readonly<Record<string, string>>;
  editable: boolean;
  commercialMode?: QuotationDraftData['mode'];
  onEditTaskHours?: (wbs: string, role: string, hours: number) => void;
  onEditTaskFixed?: (wbs: string, role: string, fixed: boolean) => void;
  onEditTaskTeam?: (wbs: string, role: string, teamId: string | null) => void;
  onEditGroupHours?: (teamKey: string, hours: number, stageCode?: string, module?: string) => void;
  onEditStage?: (stageCode: string,
    patch: { name?: string; startWeek?: number; durationWeeks?: number }) => void;
  onOpenRoleMapping?: () => void;
  onAddTask?: (stageCode: string) => void;
  onDeleteTask?: (wbs: string) => void;
  onEditTaskName?: (wbs: string, name: string) => void;
  onImportTaskExcel?: (stageCode: string, phaseName: string, file: File) => Promise<void>;
  onRemoveCommercialPhase?: (stageCode: string) => void;
  onEditPhase: (index: number, patch: Partial<Phase>) => void;
  onAddPhase: () => void;
  onRemovePhase: (index: number) => void;
}) {
  const mapping = roleTeamIds ?? {};
  const displayPhases = edt
    ? referencePhasesFromEdt(edt, mapping, teamNames, draft)
    : phases;
  const maxWeek = Math.max(1, ...displayPhases.map((phase) =>
    phase.startWeek + phase.durationWeeks - 1));
  const projectAllowsEdit = editable && Boolean(edt);
  const unmappedRoles = edt && draft?.aiPoc
    ? draft.aiPoc.proposal.roles.filter((role) => {
        const id = draft.aiPoc?.roleTeamIds[role.role];
        return !id || !activeTeams.some((team) => team.id === id);
      })
    : [];
  const needsRoleMapping = unmappedRoles.length > 0;
  return (
    <Card className={styles.surface}>
      <div className={styles.head}>
        <h2>Fases · Módulos</h2>
        <p>En semanas desde el inicio del proyecto</p>
      </div>
      {needsRoleMapping && (
        <div className={styles.mappingNotice} role="status">
          <div><strong>Asigna los perfiles IA a equipos reales de Kora</strong>
            <p>{unmappedRoles.length} perfil(es) pendientes. La EDT conserva las actividades y HH,
              pero sus perfiles no son equipos. Completa la asociación antes de distribuir tareas.</p>
          </div>
          {onOpenRoleMapping && <button type="button" disabled={!editable}
            onClick={onOpenRoleMapping}>Asignar equipos Kora</button>}
        </div>
      )}
      <div className={styles.phases}>
        {displayPhases.map((phase, index) => {
          const stage = edt?.stages?.find((item) => phase.name.startsWith(item.code + ' · ')) ??
            draft?.edtCommercialStages?.find((item) => phase.name.startsWith(item.code + ' · '));
          const stageCode = stage?.code ?? (edt?.schemaVersion === 'kora.quotation.reference-edt.v1'
            ? 'module:' + (edt.modules[index]?.name ?? phase.name) : undefined);
          const prefix = stage ? stage.code + ' · ' : '';
          const visibleName = prefix ? phase.name.slice(prefix.length) : phase.name;
          const total = phase.teamHours.reduce((sum, row) => sum + row.hours, 0);
          const tasks = referenceTasksForPhase(phase, edt, mapping, teamNames, draft);
          // Cada fila representa una asignación WBS × perfil, no una tarea única.
          // Si una actividad involucra varios perfiles, el desplegable tiene
          // más filas que WBS únicos; informar ambas cifras sin confundirlas.
          const uniqueTasks = new Set(tasks.map((task) => task.wbs)).size;
          const assignmentCount = tasks.length;
          const taskTotal = tasks.reduce((sum, task) => sum + task.hours, 0);
          const editStage = (patch: {name?:string;startWeek?:number;durationWeeks?:number}) => {
            if (edt && stageCode && onEditStage) onEditStage(stageCode, patch);
            else onEditPhase(index, {
              ...patch, ...(patch.name ? { name: prefix + patch.name } : {}),
            });
          };
          return (
            <section className={styles.phase} key={stageCode ?? index}>
              <div className={styles.phaseHeader}>
                <span className={styles.phaseBadge}>Fase {index + 2}</span>
                <span className={styles.phaseDescription}>
                  {hh(total)} HH · semanas {phase.startWeek} a {phase.startWeek + phase.durationWeeks - 1}
                </span>
                {editable && (!edt || stageCode?.startsWith('KS-')) && (
                  <button type="button" className={styles.remove}
                    onClick={() => {
                      if (!window.confirm('¿Eliminar esta fase y sus tareas comerciales?')) return;
                      if (stageCode?.startsWith('KS-')) onRemoveCommercialPhase?.(stageCode);
                      else onRemovePhase(index);
                    }}>Eliminar</button>
                )}
              </div>
              <div className={styles.phaseFields}>
                <label>Nombre del módulo
                  <input value={visibleName} disabled={!editable} maxLength={300}
                    onChange={(e) => editStage({ name: e.target.value })}/>
                </label>
                <label>Semana de inicio
                  <input type="number" min={1} max={520} value={phase.startWeek}
                    disabled={!editable}
                    onChange={(e) => editStage({ startWeek: Math.max(1, Number(e.target.value) || 1) })}/>
                </label>
                <label>Duración (semanas)
                  <input type="number" min={1} max={520} value={phase.durationWeeks}
                    disabled={!editable}
                    onChange={(e) => editStage({ durationWeeks: Math.max(1, Number(e.target.value) || 1) })}/>
                </label>
              </div>
              <div className={styles.phaseTeams}>
                {(edt
                  ? phase.teamHours
                  : teams.map((team) => ({
                      teamId: team.teamId,
                      hours: phase.teamHours.find((row) => row.teamId === team.teamId)?.hours ?? 0,
                    }))).map((row) => {
                  const label = nameOf(row.teamId, teamNames);
                  return (
                    <label key={row.teamId}>
                      <span><i style={{ background: row.teamId.startsWith('profile:')
                          ? '#a0a9b8' : quotationTeamColor(label) }}/>
                        {row.teamId.startsWith('profile:') ? 'Sin equipo · ' + row.teamId.slice(8) : label} · HH</span>
                      <QuotationGroupHoursInput value={row.hours}
                        disabled={!editable || row.teamId.startsWith('profile:')}
                        label={'HH de ' + label + ' para fase ' + (index + 2)}
                        onCommit={(amount) => {
                          if (edt && onEditGroupHours)
                            onEditGroupHours(row.teamId, amount, stage?.code,
                              edt.schemaVersion === 'kora.quotation.reference-edt.v1'
                                ? edt.modules[index]?.name : undefined);
                          else onEditPhase(index, {
                            teamHours: [
                              ...phase.teamHours.filter((item) => item.teamId !== row.teamId),
                              { teamId: row.teamId, hours: amount },
                            ],
                          });
                        }}/>
                    </label>
                  );
                })}
              </div>
              {edt && (
                <details className={styles.tasks}>
                  <summary><strong>Tareas</strong>
                    <span>{assignmentCount} {assignmentCount === 1 ? 'tarea' : 'tareas'}
                      {assignmentCount !== uniqueTasks && ' · ' + uniqueTasks +
                        (uniqueTasks === 1 ? ' actividad' : ' actividades')}
                      {assignmentCount > 0 && ' · ' + hh(taskTotal) + ' HH'}</span>
                  </summary>
                  {tasks.length > 0 && (
                    <div className={styles.tableScroll}>
                      <div className={styles.tasksHeader}>
                        <span>Tarea</span><span>Equipo</span>
                        <span>HH</span><span>Fija</span><span/>
                      </div>
                      {tasks.map((task) => (
                        <div className={styles.taskRow} key={task.wbs + ':' + task.role}>
                          <input className={styles.taskText} type="text"
                            aria-label={'Tarea ' + task.wbs + ' · ' + task.role}
                            key={task.wbs + ':' + task.role + ':' + task.name}
                            defaultValue={task.name} maxLength={300}
                            disabled={!editable}
                            onBlur={(e) => {
                              const name = e.target.value.trim();
                              if (name && name !== task.name) onEditTaskName?.(task.wbs, name);
                            }}/>
                          <select className={styles.teamSelect} disabled={!editable || needsRoleMapping}
                            aria-label={'Equipo de ' + task.wbs + ' · ' + task.role}
                            value={task.teamId ?? ''}
                            onChange={(e) => onEditTaskTeam?.(
                              task.wbs, task.role, e.target.value || null)}>
                            <option value="">
                              {needsRoleMapping ? 'Pendiente · asociar perfil' : 'Seleccionar equipo'}
                            </option>
                            {activeTeams.map((team) =>
                              <option key={team.id} value={team.id}>{team.name}</option>)}
                            {task.teamId && !activeTeams.some((t) => t.id === task.teamId) &&
                              <option value={task.teamId}>{task.team} (no activo)</option>}
                          </select>
                          {editable && onEditTaskHours
                            ? <input className={styles.editableHours} type="number"
                                min="0.01" max="1000000" step="0.01"
                                disabled={task.fixed}
                                title={task.fixed ? 'Desmarca Fija para editar las HH.' : undefined}
                                aria-label={'HH de ' + task.wbs + ' · ' + task.role}
                                value={task.hours}
                                onChange={(e) => {
                                  const next = Number(e.target.value);
                                  if (Number.isFinite(next) && next > 0)
                                    onEditTaskHours(task.wbs, task.role, next);
                                }}/>
                            : <div className={styles.readonlyInput + ' ' + styles.readonlyHours}>
                                {hh(task.hours)}
                              </div>}
                          <label className={styles.fixedField}
                            title="Una tarea fija no cambia al redistribuir horas">
                            <input type="checkbox" checked={task.fixed} disabled={!projectAllowsEdit}
                              aria-label={'Fija para ' + task.wbs + ' · ' + task.role}
                              onChange={(e) => onEditTaskFixed?.(
                                task.wbs, task.role, e.target.checked)}/>
                          </label>
                          {task.wbs.startsWith('KT-') && editable
                            ? <button type="button" className={styles.deleteTask}
                                aria-label={'Quitar tarea ' + task.wbs}
                                title="Quitar tarea añadida (no altera Gemini)"
                                onClick={() => onDeleteTask?.(task.wbs)}>×</button>
                            : <span className={styles.noDelete} title="Tarea original conservada como evidencia"/>}
                        </div>
                      ))}
                    </div>
                  )}
                  {editable && edt && stageCode && onAddTask && (
                    <div className={styles.addRow}>
                      <button type="button" className={styles.add} onClick={() => onAddTask(stageCode)}>
                        + Agregar tarea
                      </button>
                      <label className={styles.add + ' ' + styles.importAction}>
                        Importar Excel
                        <input type="file" accept=".xlsx,.xls,.csv" hidden
                          aria-label={'Importar Excel en fase ' + (index + 2)}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (file) void onImportTaskExcel?.(stageCode, visibleName, file);
                          }}/>
                      </label>
                      <button type="button" className={styles.templateLink}
                        disabled={!activeTeams.length}
                        onClick={() => downloadQuotationTaskTemplate(visibleName, activeTeams)}>
                        Ver plantilla
                      </button>
                    </div>
                  )}
                </details>
              )}
            </section>
          );
        })}
        {displayPhases.length === 0 &&
          <p className={styles.empty}>Todavía no hay fases definidas.</p>}
      </div>
      {editable && (
        <button className={styles.add} type="button" onClick={onAddPhase}>
          + Agregar fase / módulo
        </button>
      )}
      {displayPhases.length > 0 && (
        <section className={styles.roadmap} aria-labelledby="quotation-roadmap-title">
          <div className={styles.head}>
            <h3 id="quotation-roadmap-title">Roadmap preliminar</h3>
            <p>Las fechas se fijan con la fecha de inicio del proyecto</p>
          </div>
          <div className={styles.timeline}>
            {displayPhases.map((phase, index) => {
              const total = phase.teamHours.reduce((sum, row) => sum + row.hours, 0);
              const stage = edt?.stages?.find((item) => phase.name.startsWith(item.code + ' · ')) ??
                draft?.edtCommercialStages?.find((item) => phase.name.startsWith(item.code + ' · '));
              const label = stage ? phase.name.slice(stage.code.length + 3) : phase.name;
              return (
                <div className={styles.timelineRow} key={index}>
                  <span title={label}>Fase {index + 2} · {label}</span>
                  <div className={styles.timelineTrack}
                    aria-label={phase.name + ', semanas ' + phase.startWeek + ' a ' +
                      (phase.startWeek + phase.durationWeeks - 1)}>
                    <div className={styles.timelineBar} style={{
                      left: ((phase.startWeek - 1) / maxWeek * 100) + '%',
                      width: (phase.durationWeeks / maxWeek * 100) + '%',
                    }}>
                      {total > 0 && phase.teamHours.filter((t) => t.hours > 0).map((row) => {
                        const name = nameOf(row.teamId, teamNames);
                        return <span key={row.teamId} style={{
                          width: (row.hours / total * 100) + '%',
                          background: row.teamId.startsWith('profile:')
                            ? '#a0a9b8' : quotationTeamColor(name),
                        }} title={name + ': ' + hh(row.hours) + ' HH'}/>;
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
