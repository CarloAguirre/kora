import { useMemo, useState, type ReactNode } from 'react';
import {
  PROJECT_MODULE_DELIVERY_STATUS_LABELS,
  PROJECT_MODULE_STAGES,
  PROJECT_MODULE_STAGE_LABELS,
  PROJECT_MODULE_TASK_SCOPE_LABELS,
  PROJECT_MODULE_TASK_STATUS_LABELS,
  type HourEntrySummary,
  type AppliedQuotationPlanning,
  type ProjectDetail,
  type ProjectModule,
  type ProjectModuleDelivery,
  type ProjectModuleSegment,
  type ProjectModuleStage,
  type ProjectModuleTask,
} from '@kora/contracts';
import styles from './ProjectModulesCard.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Modal } from '@/shared/components/ui/Modal';
import { TextField } from '@/shared/components/ui/TextField';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Select';
import { Avatar } from '@/shared/components/ui/Avatar';
import { Badge, type BadgeTone } from '@/shared/components/ui/Badge';
import { CloseIcon, PencilIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';
import { PhaseRoadmap, type PhaseRoadmapSelection, type OperationalRoadmapRow } from '@/modules/client-portal/components/PhaseRoadmap';
import { roleFromTeamName, toPhaseRoadmap } from '@/modules/client-portal/adapters/project-detail.adapter';
import { PHASE_ROADMAP_ROLE_COLORS } from '@/modules/client-portal/types';
import { useCreateProjectModule, useCreateProjectModuleSegment, useDeleteProjectModule, useDeleteProjectModuleSegment, useDeleteProjectModuleTask, useUpdateProjectModule, useUpdateProjectModuleDelivery, useUpdateProjectModuleSegment, useUpdateProjectModuleTask } from '../api/projects.queries';
import { useConfirmAction } from '@/shared/components/ui/useConfirmAction';
import { QuotationReferenceTaskModal } from './QuotationReferenceTaskModal';
import { useAppliedQuotationPlanning } from '@/modules/estimation/api/quotation.queries';
import {
  EMPTY_EXECUTION_SEGMENT_MODAL_VALUES,
  ExecutionSegmentModal,
  segmentToModalValues,
  toSegmentInput,
  type ExecutionSegmentModalValues,
} from './ExecutionSegmentModal';

const STAGE_OPTIONS = PROJECT_MODULE_STAGES.map((stage) => ({ value: stage, label: PROJECT_MODULE_STAGE_LABELS[stage] }));
const DAY_MS = 24 * 60 * 60 * 1000;

const formatDate = (value: string | null) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CL') : '—';
const parseDate = (value: string) => new Date(`${value}T00:00:00`);
const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Días corridos entre dos fechas ISO, inclusive. */
const calendarDays = (start: string, end: string) =>
  Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / DAY_MS) + 1;

/** Color del equipo — el mismo que el Roadmap (`PHASE_ROADMAP_ROLE_COLORS`, Figma), no el de `getTeamStyle`. */
const teamColor = (teamName: string | null) => PHASE_ROADMAP_ROLE_COLORS[roleFromTeamName(teamName)];
/** Paleta de los chips del Roadmap operativo v5.02. No modifica el portal cliente. */
const operationalTeamColor = (teamName: string | null) => ({
  dev: '#ea7a1f', pmo: '#64748b', qa: '#3b82f6',
  ux: '#22a55a', ia: '#e0526b', rpa: '#14a3a0',
})[roleFromTeamName(teamName)];

const TASK_STATUS_TONE: Record<ProjectModuleTask['status'], BadgeTone> = {
  todo: 'neutral',
  in_progress: 'info',
  in_review: 'warning',
  done: 'success',
};

const DELIVERY_STATUS_TONE: Record<ProjectModuleDelivery['status'], BadgeTone> = {
  planned: 'neutral',
  delivered: 'warning',
  approved: 'success',
};

/** Una aprobada también se entregó — pasada su fecha estimada no cuenta como atraso. */
const deliveryDelayDays = (delivery: ProjectModuleDelivery) => {
  if (delivery.status !== 'planned') return 0;
  return Math.max(0, Math.round((today().getTime() - parseDate(delivery.estimatedDate).getTime()) / DAY_MS));
};

function segmentState(segment: ProjectModuleSegment): { label: string; tone: BadgeTone } {
  if (parseDate(segment.endDate) < today()) return { label: 'Terminado', tone: 'success' };
  if (parseDate(segment.startDate) <= today()) return { label: 'En curso', tone: 'info' };
  return { label: 'Próximo', tone: 'neutral' };
}

interface ProjectModulesCardProps {
  project: ProjectDetail;
  /** Registros de horas del proyecto (incluye `hasBlocker`/`blockerDescription`) — detalle de los incidentes de cada fase. */
  hourEntries: readonly HourEntrySummary[];
  /** Equipos asignados al proyecto — opciones de equipo al editar un tiempo de ejecución desde el detalle (mismo criterio que `EditProjectDialog`). */
  teamOptions: ReadonlyArray<{ value: string; label: string }>;
  canManage: boolean;
}

/**
 * Roadmap interno del proyecto — el MISMO "Roadmap por Fases" del portal de cliente
 * (`PhaseRoadmap` + `toPhaseRoadmap`), para que ambas vistas se vean idénticas (el del cliente es
 * el fiel al Figma). Lo propio de la vista interna entra por sus slots: la etapa editable de cada
 * fase y el detalle del ítem seleccionado (tramo con lápiz para editarlo sin pasar por "Editar
 * proyecto", tarea, entrega o incidentes). Crear/quitar fases y entregas sigue en "Editar
 * proyecto"; aprobar/rechazar tareas, en la vista de líder de equipo.
 */
export function ProjectModulesCard({ project, hourEntries, teamOptions, canManage }: ProjectModulesCardProps) {
  const toast = useToast();
  const createModule = useCreateProjectModule();
  const updateModule = useUpdateProjectModule();
  const deleteModule = useDeleteProjectModule();
  const updateSegment = useUpdateProjectModuleSegment();
  const createSegment = useCreateProjectModuleSegment();
  const deleteSegment = useDeleteProjectModuleSegment();
  const updateTask = useUpdateProjectModuleTask();
  const deleteTask = useDeleteProjectModuleTask();
  const { confirm, dialog: confirmationDialog } = useConfirmAction();
  const appliedPlanning = useAppliedQuotationPlanning(project.id);
  const phaseRoadmap = useMemo(() => toPhaseRoadmap(project), [project]);
  const modulesById = useMemo(() => new Map(project.modules.map((module) => [module.id, module])), [project.modules]);

  /** Tiempo de ejecución que se está editando (`null` = modal cerrado). */
  const [editingSegment, setEditingSegment] = useState<{ moduleId: string; segment: ProjectModuleSegment } | null>(null);
  const [planningBlock, setPlanningBlock] = useState<{ moduleId: string; teamId: string; name: string } | null>(null);
  const [planningMode, setPlanningMode] = useState(false);
  const [addingPhase, setAddingPhase] = useState(false);
  const [editingTask, setEditingTask] = useState<{
    moduleId: string; taskId: string; name: string; startDate: string;
    date: string; estimatedHours: string;
  } | null>(null);
  const [newPhase, setNewPhase] = useState({
    name: '', initialStage: 'discovery' as ProjectModuleStage, estimatedHours: '',
    estimatedStartDate: '', estimatedEndDate: '',
  });
  const [phaseNameDrafts, setPhaseNameDrafts] = useState<Record<string, string>>({});
  const [creatingFromReference, setCreatingFromReference] = useState<{
    moduleId: string | null;
    task: AppliedQuotationPlanning['modules'][number]['tasks'][number];
  } | null>(null);
  // Estable mientras el modal está abierto: `ExecutionSegmentModal` reinicia su formulario cuando cambia `initialValues`,
  // y un refetch del proyecto (re-render de esta tarjeta) no debe borrar lo que se está escribiendo.
  const segmentModalInitialValues = useMemo<ExecutionSegmentModalValues>(
    () => editingSegment ? segmentToModalValues(editingSegment.segment) : planningBlock
      ? { ...EMPTY_EXECUTION_SEGMENT_MODAL_VALUES, teamId: planningBlock.teamId, name: planningBlock.name }
      : EMPTY_EXECUTION_SEGMENT_MODAL_VALUES,
    [editingSegment, planningBlock],
  );
  // El equipo actual del tramo siempre es elegible, aunque ya no figure entre los equipos del proyecto.
  const segmentModalTeamOptions = useMemo(() => {
    if (!editingSegment || teamOptions.some((option) => option.value === editingSegment.segment.teamId)) return [...teamOptions];
    return [{ value: editingSegment.segment.teamId, label: editingSegment.segment.teamName }, ...teamOptions];
  }, [editingSegment, teamOptions]);

  const onConfirmSegmentEdit = async (values: ExecutionSegmentModalValues) => {
    if (!editingSegment && !planningBlock) return;
    try {
      if (editingSegment) {
        await updateSegment.mutateAsync({
          projectId: project.id,
          moduleId: editingSegment.moduleId,
          segmentId: editingSegment.segment.id,
          input: toSegmentInput(values),
        });
      } else if (planningBlock) {
        // La cotización informa semanas relativas. Solo aquí el usuario elige
        // fechas reales; desde entonces el bloque aparece en el Gantt de Kora.
        await createSegment.mutateAsync({
          projectId: project.id,
          moduleId: planningBlock.moduleId,
          input: toSegmentInput(values),
        });
      }
      setEditingSegment(null);
      setPlanningBlock(null);
      toast.success(editingSegment ? 'Bloque actualizado.' : 'Bloque planificado en el Roadmap.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo guardar el bloque.');
    }
  };

  const onDeleteSegment = async (
    moduleId: string, segment: ProjectModuleSegment, close: () => void,
  ) => {
    if (!await confirm({
      title: 'Eliminar bloque de trabajo',
      description: '¿Eliminar «' + segment.name +
        '»? Se eliminará únicamente este bloque operativo. Las tareas EDT de referencia se conservarán.',
      confirmLabel: 'Eliminar bloque', destructive: true,
    })) return;
    try {
      await deleteSegment.mutateAsync({ projectId: project.id, moduleId, segmentId: segment.id });
      close();
      toast.success('Bloque eliminado. Las referencias comerciales se conservaron.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo eliminar el bloque.');
    }
  };

  const onSaveTask = async () => {
    if (!editingTask) return;
    const hours = Number(editingTask.estimatedHours);
    if (!editingTask.name.trim()) return toast.error('Escribe el nombre de la tarea.');
    if (!editingTask.estimatedHours.trim() || !Number.isFinite(hours) || hours <= 0) {
      return toast.error('Ingresa HH estimadas mayores a cero.');
    }
    if (!editingTask.startDate || !editingTask.date || editingTask.startDate > editingTask.date) {
      return toast.error('Revisa las fechas de inicio y límite de la tarea.');
    }
    try {
      await updateTask.mutateAsync({
        projectId: project.id, moduleId: editingTask.moduleId, taskId: editingTask.taskId,
        input: { name: editingTask.name.trim(), startDate: editingTask.startDate,
          date: editingTask.date, estimatedHours: hours },
      });
      setEditingTask(null);
      toast.success('Tarea actualizada.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo editar la tarea.');
    }
  };

  const onRemoveTask = async (module: ProjectModule, task: ProjectModuleTask) => {
    if (!await confirm({
      title: 'Eliminar tarea',
      description: '¿Eliminar «' + task.name + '» del proyecto? Se mantendrá la referencia de cotización si existe.',
      confirmLabel: 'Eliminar tarea', destructive: true,
    })) return;
    try {
      await deleteTask.mutateAsync({ projectId: project.id, moduleId: module.id, taskId: task.id });
      toast.success('Tarea eliminada.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo eliminar la tarea.');
    }
  };

  const onCreatePhase = async () => {
    const name = newPhase.name.trim();
    const estimatedHours = Number(newPhase.estimatedHours);
    if (!name) return toast.error('Escribe el nombre de la fase.');
    if (!newPhase.estimatedHours.trim() || !Number.isFinite(estimatedHours) || estimatedHours <= 0) {
      return toast.error('Ingresa HH estimadas mayores a cero.');
    }
    if (newPhase.estimatedStartDate && newPhase.estimatedEndDate &&
        newPhase.estimatedStartDate > newPhase.estimatedEndDate) {
      return toast.error('La fecha de término no puede ser anterior al inicio.');
    }
    try {
      await createModule.mutateAsync({
        projectId: project.id,
        input: {
          name, initialStage: newPhase.initialStage, estimatedHours,
          ...(newPhase.estimatedStartDate ? { estimatedStartDate: newPhase.estimatedStartDate } : {}),
          ...(newPhase.estimatedEndDate ? { estimatedEndDate: newPhase.estimatedEndDate } : {}),
        },
      });
      setAddingPhase(false);
      setNewPhase({ name: '', initialStage: 'discovery', estimatedHours: '',
        estimatedStartDate: '', estimatedEndDate: '' });
      toast.success('Fase agregada al proyecto.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo agregar la fase.');
    }
  };

  const onRenamePhase = async (module: ProjectModule, rawName: string) => {
    const name = rawName.trim();
    if (!name) {
      setPhaseNameDrafts((current) => ({ ...current, [module.id]: module.name }));
      toast.error('El nombre de la fase no puede estar vacío.');
      return;
    }
    if (name === module.name) return;
    try {
      await updateModule.mutateAsync({ projectId: project.id, moduleId: module.id, input: { name } });
      toast.success('Fase renombrada.');
    } catch (error) {
      setPhaseNameDrafts((current) => ({ ...current, [module.id]: module.name }));
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo renombrar la fase.');
    }
  };

  const onAddPhaseBlock = (module: ProjectModule) => {
    if (teamOptions.length === 0) {
      toast.error('Primero asigna un equipo real al proyecto antes de crear un bloque de trabajo.');
      return;
    }
    setPlanningBlock({
      moduleId: module.id,
      teamId: teamOptions[0]?.value ?? '',
      name: '',
    });
  };

  /** Nunca borrar fases con ejecución, entregas ni referencias EDT.
   * El endpoint de Kora verifica la autorización y restricciones definitivas. */
  const onDeletePhase = async (module: ProjectModule) => {
    if (module.segments.length || module.tasks.length || module.deliveries.length ||
        module.blockerCount > 0 || hourEntries.some((entry) => entry.module?.id === module.id)) {
      toast.error('No se puede eliminar esta fase: tiene bloques, tareas, entregas o historial de horas/incidencias.');
      return;
    }
    const reference = appliedPlanning.data?.modules.find((item) => item.moduleId === module.id);
    if (reference && (reference.tasks.length || reference.relativeTeamBlocks?.length)) {
      toast.error('Esta fase tiene referencias EDT de la cotización. No se eliminará sin conciliarlas.');
      return;
    }
    if (!await confirm({
      title: 'Eliminar fase',
      description: '¿Eliminar definitivamente «' + module.name +
        '»? Esta acción no se puede deshacer. Solo se permite sin bloques, tareas ni entregas.',
      confirmLabel: 'Eliminar fase',
      destructive: true,
    })) return;
    try {
      await deleteModule.mutateAsync({ projectId: project.id, moduleId: module.id });
      toast.success('Fase eliminada.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo eliminar la fase.');
    }
  };

  const renderPhaseHeaderName = (phase: { id: string }) => {
    const module = modulesById.get(phase.id);
    if (!module) return null;
    if (!canManage || !planningMode) return <strong className={styles.headerPhaseName}>{module.name}</strong>;
    return (
      <input
        aria-label={'Nombre de la fase ' + module.name}
        className={styles.headerPhaseInput}
        value={phaseNameDrafts[module.id] ?? module.name}
        maxLength={300}
        disabled={updateModule.isPending}
        onChange={(event) => setPhaseNameDrafts((current) => ({
          ...current, [module.id]: event.target.value,
        }))}
        onBlur={(event) => void onRenamePhase(module, event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            event.currentTarget.value = module.name;
            setPhaseNameDrafts((current) => ({ ...current, [module.id]: module.name }));
            event.currentTarget.blur();
          }
        }}
      />
    );
  };

  const renderPhaseHeaderActions = (phase: { id: string }) => {
    const module = modulesById.get(phase.id);
    if (!module) return null;
    const actual = module.progress.actual;
    const expected = module.progress.expected;
    const percent = (value: number | null) => value === null ? '—' : value + '%';
    const hasDependencies = module.segments.length > 0 || module.tasks.length > 0 ||
      module.deliveries.length > 0 || module.blockerCount > 0 ||
      hourEntries.some((entry) => entry.module?.id === module.id) ||
      Boolean(appliedPlanning.data?.modules.some((item) =>
        item.moduleId === module.id && (item.tasks.length || item.relativeTeamBlocks?.length)));
    return (
      <div className={styles.phaseHeadingActions}>
        <span className={styles.phaseHeadingMeta}>
          {module.estimatedStartDate && module.estimatedEndDate
            ? formatDate(module.estimatedStartDate) + ' → ' + formatDate(module.estimatedEndDate)
            : 'Sin fechas'},
          {' '}{module.estimatedHours == null ? '—' : module.estimatedHours} HH
        </span>
        <span className={styles.phaseHeadingProgress}
          title="Avances automáticos del Roadmap de Kora, no porcentajes editables manualmente.">
          <span className={styles.phaseHeadingBar} aria-hidden="true">
            <span className={styles.phaseHeadingReal}
              style={{ width: (actual == null ? 0 : Math.min(100, Math.max(0, actual))) + '%' }} />
            {expected != null && <i className={styles.phaseHeadingMarker}
              style={{ left: Math.min(100, Math.max(0, expected)) + '%' }} />}
          </span>
          <span>{percent(actual)} real · {percent(expected)} plan</span>
        </span>
        {canManage && planningMode && (
          <>
            <Button variant="outline" size="sm" className={styles.phaseAddBlock}
              onClick={() => onAddPhaseBlock(module)}>+ Bloque de trabajo</Button>
            <Button variant="ghost" size="sm" className={styles.phaseDeleteButton}
              disabled={deleteModule.isPending || hasDependencies}
              title={hasDependencies
                ? 'La fase tiene bloques, tareas, entregas, horas, incidencias o referencias EDT que deben conservarse.'
                : 'Eliminar fase'}
              aria-label={'Eliminar fase ' + module.name}
              onClick={() => void onDeletePhase(module)}><TrashIcon size={15} /></Button>
          </>
        )}
      </div>
    );
  };

  if (project.modules.length === 0) {
    return (
      <Card>
        <p className={styles.empty}>Aún no hay fases. Se agregan desde "Editar proyecto".</p>
      </Card>
    );
  }

  /** En v5.02 los bloques/HH de la cotización siguen siendo referencias hasta
   * crear el segmento real. No asignamos fechas, responsables ni estados falsos. */
  const referenceIsConverted = (
    module: ProjectModule,
    reference: AppliedQuotationPlanning['modules'][number]['tasks'][number],
  ) => module.tasks.some((task) => task.description?.includes(
    'Referencia cotización ' + appliedPlanning.data?.versionId +
    ' · WBS ' + reference.wbs + ' · ' + reference.role,
  ));

  const getOperationalRows = (phase: { id: string }): readonly OperationalRoadmapRow[] => {
    const module = modulesById.get(phase.id);
    const reference = appliedPlanning.data?.modules.find((entry) => entry.moduleId === phase.id);
    if (!module || !reference?.relativeTeamBlocks) return [];
    return reference.relativeTeamBlocks
      .filter((block) => !module.segments.some((segment) => segment.teamId === block.teamId))
      .map((block) => {
        const teamName = project.teams.find((team) => team.teamId === block.teamId)?.teamName ??
          teamOptions.find((team) => team.value === block.teamId)?.label ?? 'Equipo por vincular';
        return {
          id: block.teamId,
          label: module.name + ' · ' + teamName,
          role: roleFromTeamName(teamName),
          hours: block.hours,
        };
      });
  };

  /** Contadores de la vista operativa: tareas existentes + referencias EDT
   * no convertidas. Nunca contamos dos veces una referencia ya creada. */
  const operationalCounts = project.modules.reduce((total, module) => {
    const reference = appliedPlanning.data?.modules.find((entry) => entry.moduleId === module.id);
    total.tasks += module.tasks.length +
      (reference?.tasks.filter((task) => !referenceIsConverted(module, task)).length ?? 0);
    total.blocks += module.segments.length + getOperationalRows({ id: module.id }).length;
    return total;
  }, { tasks: 0, blocks: 0 });

  const getOperationalMetrics = (phase: { id: string }, row: { id?: string }) => {
    const module = modulesById.get(phase.id);
    const segment = module?.segments.find((item) => item.id === row.id);
    if (!module || !segment) return { hours: null, progress: null };
    const teamSegments = module.segments.filter((item) => item.teamId === segment.teamId);
    const directTasks = module.tasks.filter((task) =>
      task.description?.includes(' · ID ' + segment.id));
    // Sin FK tarea-bloque solo atribuimos tareas de equipo si tiene un único bloque.
    const tasks = directTasks.length > 0 ? directTasks
      : teamSegments.length === 1 ? module.tasks.filter((task) => task.teamId === segment.teamId) : [];
    const taskHours = tasks.reduce((sum, task) => sum + (task.estimatedHours ?? 0), 0);
    const ref = appliedPlanning.data?.modules.find((item) => item.moduleId === phase.id)
      ?.relativeTeamBlocks?.find((item) => item.teamId === segment.teamId);
    const hours = taskHours > 0 ? taskHours
      : teamSegments.length === 1 ? ref?.hours ?? null : null;
    const doneHours = tasks.filter((task) => task.status === 'done')
      .reduce((sum, task) => sum + (task.estimatedHours ?? 0), 0);
    const progress = tasks.length
      ? Math.round(100 * (taskHours > 0 ? doneHours / taskHours
        : tasks.filter((task) => task.status === 'done').length / tasks.length))
      : null;
    return { hours, progress };
  };

  const renderOperationalContent = (phase: { id: string }) => {
    const module = modulesById.get(phase.id);
    if (!module) return null;
    const commercial = appliedPlanning.data?.modules.find((entry) => entry.moduleId === module.id);
    const references = commercial?.tasks.filter((task) => !referenceIsConverted(module, task)) ?? [];
    const unassignedActual = module.tasks.filter((task) => !task.assigneeUserId);
    const pending = [
      ...unassignedActual.map((task) => ({
        id: task.id, teamId: task.teamId, hours: task.estimatedHours ?? 0,
      })),
      ...references.map((task) => ({
        id: task.wbs + ':' + task.role, teamId: task.teamId, hours: task.hours,
      })),
    ];
    const groups = new Map<string, { count: number; hours: number }>();
    for (const row of pending) {
      const id = row.teamId ?? '';
      const group = groups.get(id) ?? { count: 0, hours: 0 };
      group.count += 1;
      group.hours += row.hours;
      groups.set(id, group);
    }
    const count = module.tasks.length + references.length;
    const approved = module.tasks.filter((task) => task.status === 'done').length;
    return <div className={styles.operationalContent}>
      {Array.from(groups, ([id, group]) => {
        const team = project.teams.find((entry) => entry.teamId === id);
        const teamName = team?.teamName ?? teamOptions.find((entry) => entry.value === id)?.label ??
          'Equipo sin vincular';
        const members = project.members.filter((member) =>
          member.teamId === id && member.userStatus === 'active');
        const firstReference = references.find((task) => task.teamId === id);
        return <div className={styles.awaitingAssignment} key={id || 'unmapped'}>
          <span className={styles.awaitingBadge}
            style={{ background: operationalTeamColor(teamName) }} aria-hidden="true">
            {teamName.slice(0, 3).toUpperCase()}
          </span>
          <div className={styles.awaitingText}>
            <strong>{module.name}: {group.count} {group.count === 1 ? 'tarea espera' : 'tareas esperan'} asignación</strong>
            <span>{members.length === 0 ?
              'No hay colaboradores activos de este equipo asignados al proyecto.' +
                (team?.leader?.fullName ? ' Esperando que ' + team.leader.fullName + ' asigne colaboradores.' : '')
              : group.hours + ' HH estimadas. Las referencias EDT deben convertirse en tareas antes de asignarlas.'}
            </span>
          </div>
          {canManage && members.length > 0 && firstReference && <Button size="sm" variant="secondary"
            onClick={() => setCreatingFromReference({ moduleId: module.id, task: firstReference })}>
            Crear tarea
          </Button>}
        </div>;
      })}
      <details className={styles.operationalTasks} open>
        <summary><strong>Tareas</strong> {count}, {approved} aprobadas</summary>
        {count ? <div className={styles.operationalTaskScroll}>
          <table className={styles.operationalTaskTable}>
            <thead><tr><th>Tarea</th><th>Asignada a</th><th>Bloque de trabajo</th>
              <th>Estado</th><th>HH est. / reales</th><th>Fecha límite</th><th aria-label="Acciones" /></tr></thead>
            <tbody>
              {module.tasks.map((task) => (
                <tr key={task.id}>
                  <td className={styles.operationalTaskTitle}>{task.name}</td>
                  <td>{task.assigneeName || 'Sin asignar'}</td>
                  <td>{(() => {
                    const linked = module.segments.find((segment) =>
                      task.description?.includes('Bloque de trabajo: ' + segment.name + ' · ID ' + segment.id));
                    return linked ? <>
                      <span className={styles.operationalTeamDot}
                        style={{ background: operationalTeamColor(linked.teamName) }} />
                      {linked.name}
                    </> : <span className={styles.unlinkedBlock}>Sin bloque vinculado</span>;
                  })()}</td>
                  <td><span className={[styles.taskState, task.assigneeUserId ? styles.taskStateAssigned : ''].join(' ')}>
                    {task.assigneeUserId ? PROJECT_MODULE_TASK_STATUS_LABELS[task.status] : 'Por asignar'}
                  </span></td>
                  <td>{task.estimatedHours ?? '—'} / —</td>
                  <td>{formatDate(task.date)}</td>
                  <td className={styles.operationalTaskActions}>
                    {canManage && <>
                      <button type="button" className={styles.taskIconAction}
                        aria-label={'Editar tarea ' + task.name} title="Editar tarea"
                        onClick={() => setEditingTask({
                          moduleId: module.id, taskId: task.id, name: task.name,
                          startDate: task.startDate, date: task.date,
                          estimatedHours: task.estimatedHours == null ? '' : String(task.estimatedHours),
                        })}><PencilIcon size={15} /></button>
                      <button type="button" className={styles.taskIconAction}
                        aria-label={'Eliminar tarea ' + task.name} title="Eliminar tarea"
                        onClick={() => void onRemoveTask(module, task)}><TrashIcon size={15} /></button>
                    </>}
                  </td>
                </tr>
              ))}
              {references.map((reference) => {
                const teamName = project.teams.find((team) => team.teamId === reference.teamId)?.teamName ??
                  teamOptions.find((team) => team.value === reference.teamId)?.label ?? reference.role;
                return <tr key={'ref:' + reference.wbs + ':' + reference.role}>
                  <td className={styles.operationalTaskTitle} title="Referencia de cotización pendiente de crear como tarea operativa">{reference.name}</td>
                  <td>Sin asignar</td>
                  <td><span className={styles.unlinkedBlock}>Pendiente de planificar</span></td>
                  <td><span className={styles.taskState} title={'Equipo: ' + teamName}>Por asignar</span></td>
                  <td>{reference.hours} / —</td>
                  <td>—</td>
                  <td className={styles.operationalTaskActions}>{canManage && <Button size="sm" variant="ghost"
                    onClick={() => setCreatingFromReference({ moduleId: module.id, task: reference })}>
                    Crear tarea
                  </Button>}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div> : <p className={styles.noOperationalTasks}>Sin tareas registradas en esta fase.</p>}
      </details>
    </div>;
  };

  const renderSelectionDetail = (phase: { id: string }, selection: PhaseRoadmapSelection, close: () => void) => {
    const module = modulesById.get(phase.id);
    if (!module) return null;
    if (selection.kind === 'incident') return <IncidentsDetail module={module} hourEntries={hourEntries} onClose={close} />;
    if (selection.kind === 'segment') {
      const segment = module.segments.find((s) => s.id === selection.id);
      return segment ? (
        <SegmentDrawer
          project={project}
          module={module}
          segment={segment}
          reference={appliedPlanning.data?.modules.find((entry) => entry.moduleId === module.id)}
          onClose={close}
          onEdit={canManage ? () => {
            setEditingSegment({ moduleId: module.id, segment });
            close();
          } : undefined}
          onDelete={canManage ? () => void onDeleteSegment(module.id, segment, close) : undefined}
        />
      ) : null;
    }
    if (selection.kind === 'task') {
      const task = module.tasks.find((t) => t.id === selection.id);
      return task ? <TaskDetail task={task} onClose={close} /> : null;
    }
    const delivery = module.deliveries.find((d) => d.id === selection.id);
    return delivery ? <DeliveryDetail delivery={delivery} label={selection.label} onClose={close} /> : null;
  };

  return (
    <>
      {(appliedPlanning.data?.unassignedTasks?.length ?? 0) > 0 && (
        <Card>
          <details className={styles.referenceTasks}>
            <summary>
              {appliedPlanning.data!.unassignedTasks!.length} tareas de referencia sin fase vinculada
            </summary>
            <p>Revisa el vínculo comercial antes de crear tareas operativas. No se modificó el Roadmap.</p>
            <ol>
              {appliedPlanning.data!.unassignedTasks!.map((task) => (
                <li key={task.wbs + ':' + task.role}>
                  <strong>{task.wbs} · {task.name}</strong>
                  <span>{task.role} · {task.hours} HH</span>
                  {canManage && (project.modules.some((module) =>
                    module.tasks.some((existing) =>
                      existing.description?.includes(
                        'Referencia cotización ' + appliedPlanning.data?.versionId +
                        ' · WBS ' + task.wbs + ' · ' + task.role,
                      ))) ? <small>Ya convertida en tarea operativa</small> :
                    <Button variant="ghost" size="sm"
                      onClick={() => setCreatingFromReference({ moduleId: null, task })}>
                      Elegir fase y crear tarea
                    </Button>)}
                </li>
              ))}
            </ol>
          </details>
        </Card>
      )}
      <PhaseRoadmap alwaysExpanded operationalView borderlessSummary phaseRoadmap={phaseRoadmap}
        operationalTaskCount={operationalCounts.tasks} operationalBlockCount={operationalCounts.blocks}
        operationalRows={getOperationalRows}
        operationalMetrics={getOperationalMetrics}
        operationalFooter={canManage ? <button type="button" className={styles.addPhaseButton}
          onClick={() => setAddingPhase(true)}>+ Agregar fase</button> : undefined}
        onPlanOperationalRow={canManage && planningMode ? (phase, row) => {
          const module = modulesById.get(phase.id);
          const reference = appliedPlanning.data?.modules.find((item) => item.moduleId === phase.id)
            ?.relativeTeamBlocks?.find((block) => block.teamId === row.id);
          if (module && reference) setPlanningBlock({
            moduleId: module.id, teamId: reference.teamId,
            name: module.name + ' · ' +
              (teamOptions.find((item) => item.value === reference.teamId)?.label ?? 'Equipo'),
          });
        } : undefined}
        renderPhaseReferences={renderOperationalContent}
        renderSelectionDetail={renderSelectionDetail}
        renderPhaseHeaderName={canManage && planningMode ? renderPhaseHeaderName : undefined}
        renderPhaseHeaderActions={renderPhaseHeaderActions}
        toolbarActions={canManage ? (
          <div className={styles.roadmapModeSwitch} role="group" aria-label="Modo del Roadmap">
            <Button size="sm" variant="ghost" aria-pressed={!planningMode}
              onClick={() => setPlanningMode(false)}>Ver</Button>
            <Button size="sm" variant="ghost" aria-pressed={planningMode}
              onClick={() => setPlanningMode(true)}>Planificar</Button>
          </div>
        ) : undefined} />
      {creatingFromReference && appliedPlanning.data && (
        <QuotationReferenceTaskModal
          key={creatingFromReference.task.wbs + ':' + creatingFromReference.task.role}
          project={project}
          moduleId={creatingFromReference.moduleId}
          versionId={appliedPlanning.data.versionId}
          versionNumber={appliedPlanning.data.versionNumber}
          reference={creatingFromReference.task}
          onClose={() => setCreatingFromReference(null)}
        />
      )}
      {confirmationDialog}
      <Modal open={editingTask !== null} title="Editar tarea"
        onClose={() => setEditingTask(null)} dismissible={!updateTask.isPending}
        footer={<>
          <Button variant="outline" onClick={() => setEditingTask(null)}
            disabled={updateTask.isPending}>Cancelar</Button>
          <Button loading={updateTask.isPending} onClick={() => void onSaveTask()}>
            Guardar cambios
          </Button>
        </>}>
        {editingTask && <div className={styles.phaseCreationForm}>
          <TextField label="Nombre de la tarea" value={editingTask.name}
            onChange={(event) => setEditingTask((current) =>
              current ? { ...current, name: event.target.value } : current)} />
          <TextField label="Horas estimadas" type="number" min={0.01} step={0.01}
            value={editingTask.estimatedHours}
            onChange={(event) => setEditingTask((current) =>
              current ? { ...current, estimatedHours: event.target.value } : current)} />
          <div className={styles.phaseCreationDates}>
            <TextField label="Fecha de inicio" type="date" value={editingTask.startDate}
              onChange={(event) => setEditingTask((current) =>
                current ? { ...current, startDate: event.target.value } : current)} />
            <TextField label="Fecha límite" type="date" value={editingTask.date}
              onChange={(event) => setEditingTask((current) =>
                current ? { ...current, date: event.target.value } : current)} />
          </div>
        </div>}
      </Modal>
      <Modal open={addingPhase} title="Agregar fase" onClose={() => setAddingPhase(false)}
        dismissible={!createModule.isPending}
        footer={<>
          <Button variant="outline" onClick={() => setAddingPhase(false)}
            disabled={createModule.isPending}>Cancelar</Button>
          <Button onClick={() => void onCreatePhase()} loading={createModule.isPending}
            disabled={!newPhase.name.trim() || !(Number(newPhase.estimatedHours) > 0)}>
            Agregar fase
          </Button>
        </>}>
        <div className={styles.phaseCreationForm}>
          <TextField label="Nombre de la fase" value={newPhase.name}
            onChange={(event) => setNewPhase((current) => ({ ...current, name: event.target.value }))} />
          <Select label="Etapa inicial" value={newPhase.initialStage} options={STAGE_OPTIONS}
            onChange={(event) => setNewPhase((current) =>
              ({ ...current, initialStage: event.target.value as ProjectModuleStage }))} />
          <TextField label="Horas estimadas" type="number" min={0.01} step={0.01}
            value={newPhase.estimatedHours}
            onChange={(event) => setNewPhase((current) =>
              ({ ...current, estimatedHours: event.target.value }))} />
          <div className={styles.phaseCreationDates}>
            <TextField label="Inicio estimado (opcional)" type="date"
              value={newPhase.estimatedStartDate}
              onChange={(event) => setNewPhase((current) =>
                ({ ...current, estimatedStartDate: event.target.value }))} />
            <TextField label="Fin estimado (opcional)" type="date"
              value={newPhase.estimatedEndDate}
              onChange={(event) => setNewPhase((current) =>
                ({ ...current, estimatedEndDate: event.target.value }))} />
          </div>
        </div>
      </Modal>
      <ExecutionSegmentModal
        open={editingSegment !== null || planningBlock !== null}
        mode={editingSegment ? 'edit' : 'create'}
        teamOptions={segmentModalTeamOptions}
        initialValues={segmentModalInitialValues}
        segmentId={editingSegment?.segment.id ?? null}
        submitting={updateSegment.isPending || createSegment.isPending}
        onCancel={() => { setEditingSegment(null); setPlanningBlock(null); }}
        onConfirm={(values) => void onConfirmSegmentEdit(values)}
      />
    </>
  );
}

/** El Gantt de Kora mantiene su selección y sus fechas; la vista interna
 * presenta los bloques existentes en el lateral como el prototipo v5.
 * No infiere consumo por bloque: los registros horarios solo indican módulo. */
function SegmentDrawer({
  project, module, segment, reference, onClose, onEdit, onDelete,
}: {
  project: ProjectDetail;
  module: ProjectModule;
  segment: ProjectModuleSegment;
  reference?: AppliedQuotationPlanning['modules'][number];
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const toast = useToast();
  const updateDelivery = useUpdateProjectModuleDelivery();
  const [comment, setComment] = useState('');
  const team = project.teams.find((item) => item.teamId === segment.teamId);
  const projected = reference?.relativeTeamBlocks?.filter(
    (block) => block.teamId === segment.teamId,
  ) ?? [];
  const hours = projected.length === 1 ? projected[0]!.hours : null;
  // Solo asociamos una entrega si hay correspondencia ÚNICA de equipo y
  // fecha final. No se crean entregas ficticias para bloques sin planificación.
  const deliveries = module.deliveries.filter((delivery) =>
    delivery.teamId === segment.teamId && delivery.estimatedDate === segment.endDate);
  const delivery = deliveries.length === 1 ? deliveries[0]! : null;
  const teamTasks = module.tasks.filter((task) => task.teamId === segment.teamId);
  const deliver = async () => {
    if (!delivery || delivery.status !== 'planned' || !comment.trim()) return;
    try {
      await updateDelivery.mutateAsync({
        projectId: project.id, moduleId: module.id, deliveryId: delivery.id,
        input: { status: 'delivered', comment: comment.trim() },
      });
      toast.success('Entrega marcada como realizada; queda pendiente de aprobación.');
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiRequestError
        ? error.message : 'No se pudo registrar la entrega.');
    }
  };
  return (
    <Modal open side title={segment.name}
      description={'Fase · ' + module.name}
      headerExtra={<Badge tone={segmentState(segment).tone}>{segmentState(segment).label}</Badge>}
      onClose={onClose}
      footer={(onEdit || onDelete) ? (
        <div className={styles.drawerFooter}>
          {onDelete && <Button variant="outline" onClick={onDelete}>Eliminar bloque</Button>}
          {onEdit && <Button onClick={onEdit}>Editar bloque</Button>}
        </div>
      ) : undefined}>
      <div className={styles.drawerScroll}>
        <p className={styles.drawerTeam}>
          <span className={styles.referenceTaskDot}
            style={{ background: teamColor(segment.teamName) }} />
          <strong>{segment.teamName}</strong>
          <span>Líder: {team?.leader?.fullName ?? 'Sin líder asignado'}</span>
        </p>
        <Facts>
          <Fact label="Inicio" value={formatDate(segment.startDate)} />
          <Fact label="Término" value={formatDate(segment.endDate)} />
          <Fact label="Duración" value={plural(calendarDays(segment.startDate, segment.endDate), 'día')} />
          <Fact label="Colaboradores" value={segment.members.length ? String(segment.members.length) : 'Sin asignar'} />
        </Facts>
        <div className={styles.drawerSection}>
          <div className={styles.drawerFacts}>
            <span>Fechas <b>{formatDate(segment.startDate)} – {formatDate(segment.endDate)}</b></span>
            <span>HH estimadas (cotización) <b>{hours ?? '—'}</b></span>
            <span>HH consumidas del bloque <b>Sin desglose por bloque</b></span>
          </div>
          <p className={styles.drawerHint}>
            Las HH reales se registran en Kora por módulo. No se atribuyen
            automáticamente a un bloque sin una relación verificable.
          </p>
        </div>
        {segment.members.length > 0 && (
          <div className={styles.drawerSection}>
            <h4>Colaboradores del bloque</h4>
            <ul className={styles.members}>
              {segment.members.map((member) => (
                <li key={member.teamMemberId} className={styles.member}>
                  <Avatar name={member.fullName} size={30} />
                  <div className={styles.memberInfo}>
                    <span className={styles.memberName}>{member.fullName}</span>
                    <span className={styles.memberMeta}>
                      {member.dailyPercent != null
                        ? member.dailyPercent + '% de dedicación diaria'
                        : 'Sin porcentaje de dedicación'}
                    </span>
                  </div>
                  <span className={styles.memberPercent}>
                    {member.dailyPercent != null ? member.dailyPercent + '%' : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className={styles.drawerSection}>
          <h4>Entrega de cierre</h4>
          {delivery ? (
            <>
              <div className={styles.drawerDelivery}>
                <strong>{delivery.name ?? module.name + ' · ' + segment.teamName}</strong>
                <span>Fecha planificada: {formatDate(delivery.estimatedDate)}</span>
                <Badge tone={DELIVERY_STATUS_TONE[delivery.status]}>
                  {PROJECT_MODULE_DELIVERY_STATUS_LABELS[delivery.status]}
                </Badge>
              </div>
              {delivery.status === 'planned' && onEdit && delivery.assigneeUserId && (
                <div className={styles.drawerDeliveryAction}>
                  <label htmlFor={'delivery-comment-' + delivery.id}>
                    Comentario obligatorio de entrega
                  </label>
                  <textarea id={'delivery-comment-' + delivery.id}
                    value={comment} maxLength={1000} rows={2}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Describe la entrega realizada" />
                  <Button disabled={!comment.trim() || updateDelivery.isPending}
                    onClick={() => void deliver()}>Marcar como entregada</Button>
                </div>
              )}
            </>
          ) : (
            <p className={styles.drawerHint}>
              No hay una entrega única vinculada a este equipo y fecha.
              Puedes configurarla desde el editor existente del proyecto.
            </p>
          )}
        </div>
        <div className={styles.drawerSection}>
          <h4>Tareas del equipo en esta fase ({teamTasks.length})</h4>
          {teamTasks.length ? (
            <ul className={styles.drawerTaskList}>
              {teamTasks.map((task) => <li key={task.id}>
                {task.name} · {task.estimatedHours ?? '—'} HH
              </li>)}
            </ul>
          ) : <p className={styles.drawerHint}>Aún no hay tareas operativas de este equipo.</p>}
        </div>
      </div>
    </Modal>
  );
}

/**
 * Tarjeta de detalle del ítem seleccionado en el Roadmap: cabecera (tipo, nombre, equipo y estado,
 * con sus acciones), una fila de datos clave y, si hay, la descripción aparte.
 */
function DetailPanel({
  eyebrow,
  title,
  teamName,
  subtitle,
  badges,
  onEdit,
  editLabel,
  onClose,
  children,
}: {
  eyebrow: string;
  title: string;
  teamName?: string | null;
  subtitle?: string | null;
  badges?: ReactNode;
  onEdit?: () => void;
  editLabel?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section className={styles.detail} aria-label={`${eyebrow}: ${title}`}>
      <header className={styles.detailHead}>
        <span className={styles.detailAccent} style={{ background: teamColor(teamName ?? null) }} aria-hidden="true" />
        <div className={styles.detailHeadText}>
          <span className={styles.detailEyebrow}>{eyebrow}</span>
          <h4 className={styles.detailTitle}>{title}</h4>
          {(teamName || subtitle) && (
            <span className={styles.detailSubtitle}>
              {teamName && (
                <span className={styles.detailTeam}>
                  <i className={styles.detailTeamDot} style={{ background: teamColor(teamName) }} />
                  {teamName}
                </span>
              )}
              {teamName && subtitle && <span aria-hidden="true">·</span>}
              {subtitle}
            </span>
          )}
        </div>
        <div className={styles.detailActions}>
          {badges}
          {onEdit && (
            <Button type="button" variant="outline" size="sm" onClick={onEdit} title={editLabel}>
              <PencilIcon size={14} /> Editar
            </Button>
          )}
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar detalle">
            <CloseIcon size={14} />
          </Button>
        </div>
      </header>
      <div className={styles.detailBody}>{children}</div>
    </section>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className={styles.facts}>{children}</dl>;
}

function Fact({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={[styles.factValue, danger ? styles.factValueDanger : ''].filter(Boolean).join(' ')}>{value}</dd>
      {hint && <dd className={styles.factHint}>{hint}</dd>}
    </div>
  );
}

function Description({ text }: { text: string | null }) {
  if (!text?.trim()) return null;
  return (
    <div className={styles.description}>
      <span className={styles.factLabel}>Descripción</span>
      <p className={styles.descriptionText}>{text}</p>
    </div>
  );
}

function TaskDetail({ task, onClose }: { task: ProjectModuleTask; onClose: () => void }) {
  const late = task.status !== 'done' && parseDate(task.date) < today();
  return (
    <DetailPanel
      eyebrow="Tarea"
      title={task.name}
      teamName={task.teamName}
      subtitle={task.assigneeName}
      badges={
        <>
          {late && <Badge tone="danger">Atrasada</Badge>}
          <Badge tone={TASK_STATUS_TONE[task.status]}>{PROJECT_MODULE_TASK_STATUS_LABELS[task.status]}</Badge>
        </>
      }
      onClose={onClose}
    >
      <Facts>
        {task.startDate && <Fact label="Inicio" value={formatDate(task.startDate)} />}
        <Fact label="Fecha límite" value={formatDate(task.date)} danger={late} />
        <Fact label="Ámbito" value={PROJECT_MODULE_TASK_SCOPE_LABELS[task.scope]} />
        <Fact label="Horas estimadas" value={task.estimatedHours != null ? `${task.estimatedHours} hh` : 'Sin definir'} />
        {/* Solo si hay fecha real: "Aprobada" + "Completada: Aún no" se contradecían en tareas antiguas sin `completedAt`. */}
        {task.completedAt && (
          <Fact
            label="Completada"
            value={new Date(task.completedAt).toLocaleDateString('es-CL')}
            hint={new Date(task.completedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          />
        )}
      </Facts>
      <Description text={task.description} />
    </DetailPanel>
  );
}

function DeliveryDetail({ delivery, label, onClose }: { delivery: ProjectModuleDelivery; label: string; onClose: () => void }) {
  const delay = deliveryDelayDays(delivery);
  return (
    <DetailPanel
      eyebrow="Entrega"
      title={label}
      teamName={delivery.teamName}
      badges={
        <>
          {delay > 0 && <Badge tone="danger">{plural(delay, 'día')} de atraso</Badge>}
          <Badge tone={DELIVERY_STATUS_TONE[delivery.status]}>{PROJECT_MODULE_DELIVERY_STATUS_LABELS[delivery.status]}</Badge>
        </>
      }
      onClose={onClose}
    >
      <Facts>
        <Fact label="Fecha estimada" value={formatDate(delivery.estimatedDate)} danger={delay > 0} />
        <Fact label="Equipo" value={delivery.teamName ?? 'Sin equipo'} />
      </Facts>
      <Description text={delivery.description} />
    </DetailPanel>
  );
}

function IncidentsDetail({
  module,
  hourEntries,
  onClose,
}: {
  module: ProjectModule;
  hourEntries: readonly HourEntrySummary[];
  onClose: () => void;
}) {
  const incidents = hourEntries.filter((entry) => entry.hasBlocker && entry.module?.id === module.id);
  return (
    <DetailPanel
      eyebrow="Incidentes"
      title={plural(module.blockerCount, 'registro') + ' de horas con bloqueo'}
      badges={<Badge tone="danger">{plural(module.blockerCount, 'incidente')}</Badge>}
      onClose={onClose}
    >
      {incidents.length === 0 ? (
        <p className={styles.empty}>No se encontraron detalles de estos incidentes en los registros de horas recientes.</p>
      ) : (
        <ul className={styles.incidents}>
          {incidents.map((entry) => (
            <li key={entry.id} className={styles.incident}>
              <span className={styles.incidentMeta}>
                {formatDate(entry.date)} · {entry.user.fullName}
                {entry.team?.name ? ` · ${entry.team.name}` : ''}
              </span>
              <span className={styles.incidentDescription}>{entry.blockerDescription || 'Sin detalle'}</span>
            </li>
          ))}
        </ul>
      )}
    </DetailPanel>
  );
}
