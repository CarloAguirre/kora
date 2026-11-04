import { useMemo, useState } from 'react';
import type {
  AppliedQuotationPlanning, ProjectDetail, ProjectModule, ProjectModuleTaskScope,
} from '@kora/contracts';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { useCreateProjectModuleTask, useUpdateProjectModuleTask } from '../api/projects.queries';
import styles from './AssignBlockTasksModal.module.css';

type CommercialTask = AppliedQuotationPlanning['modules'][number]['tasks'][number];
type AssignmentRow = {
  key: string; kind: 'existing' | 'reference'; taskId?: string;
  reference?: CommercialTask; name: string; hours: number; description: string | null;
  assignee: string; segmentId: string | null; startDate: string; date: string;
};
function roleScope(role: string): ProjectModuleTaskScope {
  const value = role.toLowerCase();
  if (value.includes('qa') || value.includes('test')) return 'qa';
  if (value.includes('ux') || value.includes('diseñ') || value.includes('disen')) return 'diseno';
  if (value.includes('pmo') || value.includes('cliente')) return 'revision_cliente';
  return 'desarrollo';
}
export function AssignBlockTasksModal({
  project, module, teamId, referenceTasks, versionId, focusKey, onClose,
}: {
  project: ProjectDetail;
  module: ProjectModule;
  teamId: string;
  referenceTasks: readonly CommercialTask[];
  versionId: string;
  focusKey?: string;
  onClose: () => void;
}) {
  const create = useCreateProjectModuleTask();
  const update = useUpdateProjectModuleTask();
  const team = project.teams.find((entry) => entry.teamId === teamId);
  const members = project.members.filter((member) =>
    member.teamId === teamId && member.userStatus === 'active');
  const blocks = module.segments.filter((segment) => segment.teamId === teamId);
  const [blockId, setBlockId] = useState(blocks.length === 1 ? blocks[0]!.id : '');
  const block = blocks.find((entry) => entry.id === blockId);
  const initialRows = useMemo(() => {
    const existing: AssignmentRow[] = module.tasks.filter((task) =>
      task.teamId === teamId && !task.assigneeUserId).map((task) => ({
      key: task.id, kind: 'existing', taskId: task.id,
      name: task.name, hours: task.estimatedHours ?? 0, description: task.description,
      assignee: '', segmentId: task.segmentId ?? null, startDate: task.startDate, date: task.date,
    }));
    const refs: AssignmentRow[] = referenceTasks.map((task) => ({
      key: 'ref:' + task.wbs + ':' + task.role, kind: 'reference',
      reference: task, name: task.name, hours: task.hours, description: task.description ?? null,
      assignee: '', segmentId: block?.id ?? null,
      startDate: block?.startDate ?? '', date: block?.endDate ?? '',
    }));
    return [...existing, ...refs].filter((row) => !focusKey || row.key === focusKey);
  }, [module.tasks, referenceTasks, teamId, focusKey]); // Fecha de bloque se ajusta vía selector.
  const [rows, setRows] = useState<AssignmentRow[]>(initialRows);
  const [bulkAssignee, setBulkAssignee] = useState(members[0]?.userId ?? '');
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const selected = rows.filter((row) => row.assignee && !saved.has(row.key));
  const eligible = selected.length > 0 && selected.every((row) => {
    const linked = module.segments.find((item) => item.id === (blockId || row.segmentId));
    return row.hours > 0 && row.startDate && row.date && row.startDate <= row.date &&
      (row.kind !== 'reference' || Boolean(blockId || row.segmentId)) &&
      (!linked || (linked.teamId === teamId &&
        row.startDate >= linked.startDate && row.date <= linked.endDate));
  });
  const formatIso = (date: string) => date ? date.slice(8, 10) + '-' + date.slice(5, 7) +
    '-' + date.slice(0, 4) : '—';

  const setRow = (key: string, patch: Partial<AssignmentRow>) => {
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  };
  const setBlock = (value: string) => {
    setBlockId(value);
    const chosen = blocks.find((entry) => entry.id === value);
    if (chosen) setRows((current) => current.map((row) => saved.has(row.key) ? row : {
      ...row, segmentId: chosen.id, startDate: chosen.startDate, date: chosen.endDate,
    }));
  };
  const assign = async () => {
    if (!eligible || pending) return;
    setPending(true);
    setError('');
    const nextSaved = new Set(saved);
    const errors: string[] = [];
    // Cada registro usa los casos de uso de Kora; un fallo parcial se informa y
    // las filas ya publicadas no vuelven a crearse al reintentar.
    for (const row of selected) {
      try {
        if (row.kind === 'existing' && row.taskId) {
          await update.mutateAsync({
            projectId: project.id, moduleId: module.id, taskId: row.taskId,
            input: { assigneeUserId: row.assignee, teamId, segmentId: blockId || row.segmentId || null,
              startDate: row.startDate, date: row.date, status: 'todo' },
          });
        } else if (row.reference) {
          const source = 'Referencia cotización ' + versionId + ' · WBS ' +
            row.reference.wbs + ' · ' + row.reference.role;
          const fullDescription = [source, ...(block ? [
            'Bloque de trabajo: ' + block.name + ' · ID ' + block.id] : []), row.description ?? '']
            .filter(Boolean).join('\n');
          if (fullDescription.length > 2000) throw new Error('Descripción excede 2.000 caracteres.');
          await create.mutateAsync({
            projectId: project.id, moduleId: module.id,
            input: {
              name: row.name, teamId, segmentId: blockId || row.segmentId || null,
              assigneeUserId: row.assignee, status: 'todo', scope: roleScope(row.reference.role),
              startDate: row.startDate, date: row.date, estimatedHours: row.hours,
              description: fullDescription,
            },
          });
        }
        nextSaved.add(row.key);
        setSaved(new Set(nextSaved));
      } catch (cause) {
        errors.push(row.name + ': ' + (cause instanceof Error ? cause.message : 'error al asignar'));
      }
    }
    setPending(false);
    if (errors.length) setError('Se completaron ' + nextSaved.size + ' tareas. ' + errors.join(' · '));
    else onClose();
  };
  return <Modal open title={'Asignar tareas · ' + module.name}
    description={(team?.teamName ?? 'Equipo') +
      '. Las HH se conservan; elige colaboradores y fechas. Las filas sin asignar quedan pendientes.'}
    onClose={onClose} dismissible={!pending}
    footer={<div className={styles.footer}>
      <span>{saved.size} de {rows.length} asignadas</span>
      <div className={styles.actions}>
        <Button variant="outline" disabled={pending} onClick={onClose}>Cancelar</Button>
        <Button disabled={!eligible || pending} loading={pending}
          onClick={() => void assign()}>Asignar tareas</Button>
      </div>
    </div>}>
    <div className={styles.body}>
      {blocks.length > 0 && <Select label="Bloque de trabajo" value={blockId}
        placeholder={blocks.length === 1 ? 'Bloque existente' : 'Elegir bloque'}
        options={blocks.map((entry) => ({ value: entry.id, label: entry.name +
          ' (' + formatIso(entry.startDate) + ' → ' + formatIso(entry.endDate) + ')' }))}
        onChange={(event) => setBlock(event.target.value)} />}
      <div className={styles.bulk}>
        <label htmlFor="assign-all-tasks">Asignar todas a</label>
        <select id="assign-all-tasks" value={bulkAssignee}
          onChange={(event) => setBulkAssignee(event.target.value)}>
          <option value="">Seleccionar persona</option>
          {members.map((member) => <option key={member.userId} value={member.userId}>
            {member.fullName}
          </option>)}
        </select>
        <Button variant="outline" disabled={!bulkAssignee || pending}
          onClick={() => setRows((current) => current.map((row) =>
            saved.has(row.key) ? row : { ...row, assignee: bulkAssignee }))}>
          Aplicar
        </Button>
      </div>
      {referenceTasks.length > 0 && blocks.length === 0 && <p role="alert" className={styles.warning}>
        Primero planifica un bloque de trabajo para este equipo. Las tareas de la EDT
        deben tener un bloque y fechas reales antes de ser asignadas.
      </p>}
      {members.length === 0 && <p role="alert" className={styles.warning}>
        Este equipo aún no tiene colaboradores activos asignados al proyecto.
      </p>}
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead><tr><th>Tarea</th><th>HH est.</th><th>Asignado a</th>
            <th>Fecha de inicio</th><th>Fecha límite</th></tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.key}>
              <td><strong>{row.name}</strong>{saved.has(row.key) && <small>Asignada</small>}</td>
              <td>{row.hours}</td>
              <td><select aria-label={'Asignado a ' + row.name} value={row.assignee}
                disabled={pending || saved.has(row.key)}
                onChange={(event) => setRow(row.key, { assignee: event.target.value })}>
                <option value="">Sin asignar</option>
                {members.map((member) => <option key={member.userId} value={member.userId}>
                  {member.fullName}
                </option>)}
              </select></td>
              <td><TextField type="date" aria-label={'Inicio ' + row.name}
                value={row.startDate} disabled={pending || saved.has(row.key)}
                onChange={(event) => setRow(row.key, { startDate: event.target.value })}/></td>
              <td><TextField type="date" aria-label={'Límite ' + row.name}
                value={row.date} disabled={pending || saved.has(row.key)}
                onChange={(event) => setRow(row.key, { date: event.target.value })}/></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p>No quedan tareas de este equipo esperando asignación.</p>}
      {error && <p className={styles.warning} role="alert">{error}</p>}
    </div>
  </Modal>;
}
