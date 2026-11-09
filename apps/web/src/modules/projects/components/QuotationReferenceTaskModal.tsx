import { useState } from 'react';
import { Link } from 'react-router-dom';
import { projectTeamPath } from '@/app/router/paths';
import {
  PROJECT_MODULE_TASK_SCOPES,
  PROJECT_MODULE_TASK_SCOPE_LABELS,
  type AppliedQuotationPlanning,
  type ProjectDetail,
  type ProjectModuleTaskScope,
} from '@kora/contracts';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { useCreateProjectModuleTask } from '../api/projects.queries';
import styles from './QuotationReferenceTaskModal.module.css';

type ReferenceTask = AppliedQuotationPlanning['modules'][number]['tasks'][number];

/** Convierte UNA referencia comercial en tarea operativa mediante el caso de uso
 * existente de Kora. Las fechas y el colaborador los define el usuario. */
export function QuotationReferenceTaskModal({
  project, moduleId, versionId, versionNumber, reference, onClose, mode = 'create',
}: {
  project: ProjectDetail;
  moduleId: string | null;
  versionId: string;
  versionNumber: number;
  reference: ReferenceTask;
  mode?: 'create' | 'edit';
  onClose: () => void;
}) {
  const create = useCreateProjectModuleTask();
  const initialTeamId = reference.teamId && project.teams.some((t) =>
    t.teamId === reference.teamId) ? reference.teamId : '';
  const [name, setName] = useState(reference.name);
  const [description, setDescription] = useState(reference.description ?? '');
  const candidateBlocks = project.modules.find((module) => module.id === moduleId)
    ?.segments.filter((segment) => segment.teamId === initialTeamId) ?? [];
  const initialBlock = mode === 'edit' && candidateBlocks.length === 1 ? candidateBlocks[0] : null;
  const [blockId, setBlockId] = useState(initialBlock?.id ?? '');
  const [status, setStatus] = useState<'todo' | 'in_progress'>('todo');
  const [targetModuleId, setTargetModuleId] = useState(moduleId ?? '');
  const [teamId, setTeamId] = useState(initialTeamId);
  const [assignee, setAssignee] = useState('');
  const [startDate, setStartDate] = useState(initialBlock?.startDate ?? '');
  const [date, setDate] = useState(initialBlock?.endDate ?? '');
  const [hours, setHours] = useState(String(reference.hours));
  const role = reference.role.toLowerCase();
  const suggestedScope: ProjectModuleTaskScope = role.includes('qa') || role.includes('test')
    ? 'qa' : role.includes('ux') || role.includes('diseñ') ? 'diseno'
      : role.includes('pmo') ? 'revision_cliente' : 'desarrollo';
  const [scope, setScope] = useState<ProjectModuleTaskScope | ''>(
    mode === 'edit' ? suggestedScope : '',
  );
  const [error, setError] = useState('');
  // La tarea referencial tiene equipo fijo: asignar personas nunca lo cambia.
  const members = project.members.filter((member) =>
    member.teamId === teamId && member.userStatus === 'active' && !member.blockedAt);
  const eligibleBlocks = project.modules.find((module) => module.id === targetModuleId)
    ?.segments.filter((segment) => segment.teamId === teamId) ?? [];
  const selectedBlock = eligibleBlocks.find((segment) => segment.id === blockId);
  const chosenDatesFitBlock = !selectedBlock ||
    (startDate >= selectedBlock.startDate && date <= selectedBlock.endDate);
  const sourceMarker = 'Referencia cotización ' + versionId + ' · WBS ' +
    reference.wbs + ' · ' + reference.role;
  const formValid = Boolean(targetModuleId && name.trim() && teamId && (mode === 'edit' || assignee) && scope && startDate && date &&
    startDate <= date && Boolean(selectedBlock) && chosenDatesFitBlock && Number(hours) > 0 &&
    Number.isFinite(Number(hours)) && Number(hours) <= 1_000_000);
  const submit = async () => {
    if (!formValid) {
      setError('Completa la fase, equipo, ámbito, fechas y bloque de trabajo. El responsable puede quedar pendiente.');
      return;
    }
    setError('');
    const fullDescription = [sourceMarker,
      ...(selectedBlock ? ['Bloque de trabajo: ' + selectedBlock.name + ' · ID ' + selectedBlock.id] : []),
      description.trim(),
    ].filter(Boolean).join('\n');
    if (fullDescription.length > 2000) {
      setError('La descripción y la trazabilidad superan los 2.000 caracteres.');
      return;
    }
    try {
      await create.mutateAsync({
        projectId: project.id, moduleId: targetModuleId,
        input: {
          name: name.trim(), teamId, segmentId: blockId || null,
          assigneeUserId: assignee || null,
          description: fullDescription,
          estimatedHours: Number(hours),
          startDate, date, status, scope: scope || undefined,
        },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible crear la tarea operativa.');
    }
  };
  return (
    <Modal open title={mode === 'edit' ? 'Editar tarea' : 'Nueva tarea'}
      description={'Referencia EDT · v' + versionNumber + ' · ' + reference.wbs}
      onClose={onClose} dismissible={!create.isPending}
      footer={<div className={styles.actions}>
        <Button variant="outline" disabled={create.isPending} onClick={onClose}>Cancelar</Button>
        <Button disabled={!formValid || create.isPending}
          loading={create.isPending} onClick={() => void submit()}>
          {mode === 'edit' ? 'Guardar cambios' : 'Crear tarea'}
        </Button>
      </div>}>
      <div className={styles.fields}>
        <TextField label="Título de la tarea" required value={name}
          maxLength={300} onChange={(event) => setName(event.target.value)} />
        <div className={styles.field}>
          <label htmlFor={'description-' + reference.wbs}>Descripción</label>
          <textarea id={'description-' + reference.wbs}
            placeholder="Qué incluye esta tarea" value={description}
            rows={3} maxLength={1800}
            onChange={(event) => setDescription(event.target.value)} />
        </div>
        <Select label="Asignado a" required={mode === 'create'} value={assignee && teamId ? teamId + ':' + assignee : ''}
          placeholder="Seleccionar persona…"
          options={members.map((member) => ({
            value: member.teamId + ':' + member.userId,
            label: member.fullName + ' · ' +
              (project.teams.find((team) => team.teamId === member.teamId)?.teamName ?? 'Equipo Kora'),
          }))}
          onChange={(event) => {
            const selected = members.find((member) =>
              member.teamId + ':' + member.userId === event.target.value);
            setAssignee(selected?.userId ?? '');
            if (!selected) setStatus('todo');
          }} />
        <p className={styles.help}>Solo aparecen colaboradores activos del equipo
          responsable de esta tarea.
          {mode === 'edit' && ' Si todavía no hay personas, puedes guardar la tarea por asignar.'}
        </p>
        {initialTeamId && members.length === 0 && (
          <p className={styles.help}>
            El equipo propuesto todavía no tiene colaboradores en este proyecto.
            {' '}
            <Link to={projectTeamPath(project, {
              id: initialTeamId,
              slug: project.teams.find((team) => team.teamId === initialTeamId)?.teamSlug,
            })}>Gestionar colaboradores del equipo</Link>
          </p>
        )}
        <Select label="Módulo relacionado" required value={targetModuleId}
          placeholder="Seleccionar fase"
          options={project.modules.map((module) => ({
            value: module.id, label: module.name,
          }))}
          onChange={(event) => { setTargetModuleId(event.target.value); setBlockId(''); }} />
        <Select label="Bloque de trabajo" required value={blockId}
          disabled={eligibleBlocks.length === 0 || (mode === 'create' && !assignee)}
          placeholder={eligibleBlocks.length === 0 ? 'Primero planifica un bloque' :
            mode === 'create' && !assignee ? 'Elige primero a quién se asigna' : 'Selecciona un bloque'}
          options={eligibleBlocks.map((segment) => ({
            value: segment.id, label: segment.name + ' (' + segment.startDate + ' – ' + segment.endDate + ')',
          }))}
          onChange={(event) => {
            setBlockId(event.target.value);
            const block = eligibleBlocks.find((entry) => entry.id === event.target.value);
            if (block) { setStartDate(block.startDate); setDate(block.endDate); }
          }} />
        <div className={styles.dates}>
          <Select label="Estado" value={status}
            options={[
              { value: 'todo', label: assignee ? 'Pendiente' : 'Por asignar' },
              ...(assignee ? [{ value: 'in_progress', label: 'En curso' }] : []),
            ]}
            onChange={(event) => setStatus(event.target.value as 'todo' | 'in_progress')} />
          <TextField label="HH estimadas" type="number" step="0.01" min="0.01"
            required value={hours} onChange={(event) => setHours(event.target.value)} />
        </div>
        {mode === 'create' && <Select label="Ámbito Kora" required value={scope}
          placeholder="Selecciona un ámbito"
          options={PROJECT_MODULE_TASK_SCOPES.map((value) => ({
            value, label: PROJECT_MODULE_TASK_SCOPE_LABELS[value],
          }))}
          onChange={(event) => setScope(event.target.value as ProjectModuleTaskScope)} />}
        <div className={styles.dates}>
          <TextField label="Fecha de inicio" type="date" required
            value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <TextField label="Fecha límite" type="date" required
            min={startDate || undefined} value={date}
            onChange={(event) => setDate(event.target.value)} />
        </div>
        {eligibleBlocks.length === 0 && <p role="alert" className={styles.error}>
          Planifica primero un bloque de trabajo para este equipo en la fase seleccionada.
        </p>}
        {selectedBlock && !chosenDatesFitBlock && (
          <p role="alert" className={styles.error}>
            Las fechas deben estar dentro del bloque seleccionado:
            {' '}{selectedBlock.startDate} a {selectedBlock.endDate}.
          </p>
        )}
        {blockId && <p className={styles.help}>
          La tarea quedará vinculada al bloque elegido; la referencia comercial se conserva.
        </p>}
        {mode === 'edit' && <p className={styles.help}>
          Esta fila aún es una referencia de la cotización. Guardar creará su tarea operativa
          editable, sin modificar la versión comercial.
        </p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </div>
    </Modal>
  );
}
