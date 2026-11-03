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
  project, moduleId, versionId, versionNumber, reference, onClose,
}: {
  project: ProjectDetail;
  moduleId: string | null;
  versionId: string;
  versionNumber: number;
  reference: ReferenceTask;
  onClose: () => void;
}) {
  const create = useCreateProjectModuleTask();
  const initialTeamId = reference.teamId && project.teams.some((t) =>
    t.teamId === reference.teamId) ? reference.teamId : '';
  const [name, setName] = useState(reference.name);
  const [targetModuleId, setTargetModuleId] = useState(moduleId ?? '');
  const [teamId, setTeamId] = useState(initialTeamId);
  const [assignee, setAssignee] = useState('');
  const [startDate, setStartDate] = useState('');
  const [date, setDate] = useState('');
  const [hours, setHours] = useState(String(reference.hours));
  const [scope, setScope] = useState<ProjectModuleTaskScope | ''>('');
  const [error, setError] = useState('');
  const members = project.members.filter((member) =>
    member.teamId === teamId && member.userStatus === 'active');
  const sourceMarker = 'Referencia cotización ' + versionId + ' · WBS ' +
    reference.wbs + ' · ' + reference.role;
  const formValid = Boolean(targetModuleId && name.trim() && teamId && assignee && scope && startDate && date &&
    startDate <= date && Number(hours) > 0 &&
    Number.isFinite(Number(hours)) && Number(hours) <= 1_000_000);
  const submit = async () => {
    if (!formValid) {
      setError('Selecciona fase, equipo, colaborador, ámbito, fechas válidas y HH antes de crear la tarea.');
      return;
    }
    setError('');
    try {
      await create.mutateAsync({
        projectId: project.id, moduleId: targetModuleId,
        input: {
          name: name.trim(), teamId, assigneeUserId: assignee || null,
          description: [sourceMarker, reference.description].filter(Boolean).join('\n').slice(0, 2000),
          estimatedHours: Number(hours),
          startDate, date, status: 'todo', scope: scope || undefined,
        },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible crear la tarea operativa.');
    }
  };
  return (
    <Modal open title="Crear tarea desde cotización"
      description={'Referencia EDT · v' + versionNumber + ' · ' + reference.wbs}
      onClose={onClose} dismissible={!create.isPending}
      footer={<div className={styles.actions}>
        <Button variant="outline" disabled={create.isPending} onClick={onClose}>Cancelar</Button>
        <Button disabled={!formValid || create.isPending}
          loading={create.isPending} onClick={() => void submit()}>
          Crear tarea
        </Button>
      </div>}>
      <div className={styles.fields}>
        <p className={styles.help}>La propuesta se conserva como referencia. Solo después de confirmar
          las fechas y el equipo se crea una tarea real con el flujo existente de Kora.
          Puede generar Forecast.</p>
        <Select label="Fase operativa de destino" required value={targetModuleId}
          placeholder="Selecciona una fase existente"
          options={project.modules.map((module) => ({
            value: module.id, label: module.name,
          }))}
          onChange={(event) => setTargetModuleId(event.target.value)} />
        <TextField label="Nombre de la tarea" required value={name}
          maxLength={300} onChange={(e) => setName(e.target.value)} />
        <Select label="Equipo Kora" required value={teamId}
          placeholder="Selecciona un equipo"
          options={project.teams.map((team) => ({
            value: team.teamId, label: team.teamName,
          }))}
          onChange={(e) => {setTeamId(e.target.value);setAssignee('');}} />
        <Select label="Asignado a" required value={assignee}
          placeholder="Sin asignar todavía"
          options={members.map((member) => ({
            value: member.userId, label: member.fullName,
          }))}
          onChange={(e) => setAssignee(e.target.value)} />
        {teamId && members.length === 0 && project.teams.some((team) => team.teamId === teamId) && (
          <p className={styles.help}>
            No hay colaboradores asignados a este equipo en el proyecto.
            {' '}
            <Link to={projectTeamPath(project, {
              id: teamId,
              slug: project.teams.find((team) => team.teamId === teamId)?.teamSlug,
            })}>Gestionar colaboradores del equipo</Link>
            {' '}antes de crear la tarea.
          </p>
        )}
        <Select label="Ámbito" required value={scope}
          placeholder="Selecciona un ámbito"
          options={PROJECT_MODULE_TASK_SCOPES.map((value) => ({
            value, label: PROJECT_MODULE_TASK_SCOPE_LABELS[value],
          }))}
          onChange={(e) => setScope(e.target.value as ProjectModuleTaskScope)} />
        <TextField label="HH estimadas" type="number" step="0.01" min="0.01"
          required value={hours} onChange={(e) => setHours(e.target.value)} />
        <div className={styles.dates}>
          <TextField label="Fecha de inicio" type="date" required
            value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <TextField label="Fecha límite" type="date" required
            min={startDate || undefined} value={date}
            onChange={(e) => setDate(e.target.value)} />
        </div>
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </div>
    </Modal>
  );
}
