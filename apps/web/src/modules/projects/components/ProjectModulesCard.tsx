import { useMemo, useState } from 'react';
import {
  PROJECT_MODULE_DELIVERY_STATUS_LABELS,
  type CreateProjectModuleSegmentInput,
  type UpdateProjectModuleSegmentInput,
  type HourEntrySummary,
  type AppliedQuotationPlanning,
  type ProjectDetail,
  type ProjectModule,
  type ProjectModuleDelivery,
  type ProjectModuleSegment,
  type ProjectModuleTask,
} from '@kora/contracts';
import styles from './ProjectModulesCard.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Modal } from '@/shared/components/ui/Modal';
import { TextField } from '@/shared/components/ui/TextField';
import { Button } from '@/shared/components/ui/Button';
import { PillSwitcher } from '@/shared/components/ui/PillSwitcher';
import { Badge, type BadgeTone } from '@/shared/components/ui/Badge';
import { TrashIcon } from '@/shared/components/icons/Icons';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';
import { PhaseRoadmap, type PhaseRoadmapSelection, type OperationalRoadmapRow } from '@/modules/client-portal/components/PhaseRoadmap';
import { roleFromTeamName, toPhaseRoadmap } from '@/modules/client-portal/adapters/project-detail.adapter';
import { useCreateProjectModule, useCreateProjectModuleSegment, useDeleteProjectModule, useDeleteProjectModuleSegment, useDeleteProjectModuleTask, useUpdateProjectModule, useUpdateProjectModuleSegment, useUpdateProjectModuleTask } from '../api/projects.queries';
import { useConfirmAction } from '@/shared/components/ui/useConfirmAction';
import { useExcludeRoadmapReference, useRoadmapReferenceExclusions } from '../api/projects.queries';
import { QuotationReferenceTaskModal } from './QuotationReferenceTaskModal';
import { ExecutionTaskModal } from './ExecutionTaskModal';
import { DuplicateTaskModal } from './DuplicateTaskModal';
import { NewWorkBlockModal, type WorkBlockFormInput } from './NewWorkBlockModal';
import { AssignBlockTasksModal } from './AssignBlockTasksModal';
import { NewOperationalTaskModal } from './NewOperationalTaskModal';
import { SegmentDrawer } from './SegmentDrawer';
import { ReviewActionModal, type ReviewAction } from './ReviewActionModal';
import { ReferenceBlockDrawer } from './ReferenceBlockDrawer';
import { useAppliedQuotationPlanning } from '@/modules/estimation/api/quotation.queries';
import { indexTeamBlockProgress, roadmapBlockMetrics } from '../lib/team-progress';
import { ProjectPhaseTasksTable } from './ProjectPhaseTasksTable';
import { phaseHeaderMeta } from '../lib/phase-header-meta';
import {
  ProjectRoadmapTaskDetail, DetailPanel, Facts, Fact, Description,
} from './ProjectRoadmapTaskDetail';

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


/** Paleta de los chips del Roadmap operativo v5.02. No modifica el portal cliente. */
const operationalTeamColor = (teamName: string | null) => ({
  dev: '#ea7a1f', pmo: '#64748b', qa: '#3b82f6',
  ux: '#22a55a', ia: '#e0526b', rpa: '#14a3a0',
})[roleFromTeamName(teamName)];

/** La tabla usa el tamaño original de "Por asignar" para TODOS sus chips.
 *  Las cuatro clases existen en el CSS Module; el ! resuelve la firma
 *  string | undefined generada con noUncheckedIndexedAccess. */

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

interface ProjectModulesCardProps {
  project: ProjectDetail;
  /** Registros de horas del proyecto (incluye `hasBlocker`/`blockerDescription`) — detalle de los incidentes de cada fase. */
  hourEntries: readonly HourEntrySummary[];
  /** Equipos asignados al proyecto — opciones de equipo al editar un tiempo de ejecución desde el detalle (mismo criterio que `EditProjectDialog`). */
  teamOptions: ReadonlyArray<{ value: string; label: string }>;
  canManage: boolean;
  /** Lleva a Resumen → Equipos asignados cuando la fase no puede planificarse. */
  onNavigateToTeams?: () => void;
}

/**
 * Roadmap interno del proyecto — el MISMO "Roadmap por Fases" del portal de cliente
 * (`PhaseRoadmap` + `toPhaseRoadmap`), para que ambas vistas se vean idénticas (el del cliente es
 * el fiel al Figma). Lo propio de la vista interna entra por sus slots: los datos de cada fase y el
 * detalle del ítem seleccionado (tramo con lápiz para editarlo sin pasar por "Editar proyecto",
 * tarea, entrega o incidentes). La etapa actual se muestra pero no se cambia acá — un select que
 * guardaba al elegir hacía fácil cambiarla sin querer —; se cambia en "Editar proyecto", igual que
 * crear/quitar fases y entregas. La revisión de tareas está disponible aquí y
 * también en la vista del líder de equipo; ambas usan el mismo endpoint y modal.
 */
export function ProjectModulesCard({
  project, hourEntries, teamOptions, canManage, onNavigateToTeams,
}: ProjectModulesCardProps) {
  const toast = useToast();
  const createModule = useCreateProjectModule();
  const updateModule = useUpdateProjectModule();
  const deleteModule = useDeleteProjectModule();
  const updateSegment = useUpdateProjectModuleSegment();
  const createSegment = useCreateProjectModuleSegment();
  const deleteSegment = useDeleteProjectModuleSegment();
  const deleteTask = useDeleteProjectModuleTask();
  const updateTask = useUpdateProjectModuleTask();
  const { confirm, dialog: confirmationDialog } = useConfirmAction();
  const appliedPlanning = useAppliedQuotationPlanning(project.id);
  const roadmapExclusions = useRoadmapReferenceExclusions(project.id);
  const excludeRoadmapReference = useExcludeRoadmapReference();
  const phaseRoadmap = useMemo(() => toPhaseRoadmap(project), [project]);
  const modulesById = useMemo(() => new Map(project.modules.map((module) => [module.id, module])), [project.modules]);
  const blockProgressById = useMemo(() => indexTeamBlockProgress(project), [project]);
  const pendingReview = useMemo(() => project.modules.flatMap((module) =>
    module.tasks.filter((task) => !task.cancelledAt && task.status === 'in_review')
      .map((task) => ({ moduleId: module.id, moduleName: module.name, task })),
  ), [project.modules]);
  const [reviewTarget, setReviewTarget] = useState<{
    moduleId: string; taskId: string; action: ReviewAction;
  } | null>(null);
  const reviewing = reviewTarget ? project.modules.find((module) =>
    module.id === reviewTarget.moduleId)?.tasks.find((task) => task.id === reviewTarget.taskId) : null;
  const confirmReview = async (reason?: string) => {
    if (!reviewTarget || !reviewing || reviewing.status !== 'in_review') return;
    try {
      await updateTask.mutateAsync({
        projectId: project.id, moduleId: reviewTarget.moduleId, taskId: reviewTarget.taskId,
        input: reviewTarget.action === 'approve'
          ? { status: 'done', rejectionReason: null }
          : { status: 'in_progress', rejectionReason: reason ?? '' },
      });
      toast.success(reviewTarget.action === 'approve' ? 'Tarea aprobada.' : 'Tarea devuelta al colaborador.');
      setReviewTarget(null);
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message :
        'No fue posible revisar la tarea.');
    }
  };
  const reviewActions = (moduleId: string, task: ProjectModuleTask) =>
    <div className={styles.reviewActions}>
      <Button size="sm" disabled={updateTask.isPending}
        onClick={() => setReviewTarget({ moduleId, taskId: task.id, action: 'approve' })}>Aprobar</Button>
      <Button size="sm" variant="outline" disabled={updateTask.isPending}
        onClick={() => setReviewTarget({ moduleId, taskId: task.id, action: 'reject' })}>Devolver</Button>
    </div>;

  /** Tiempo de ejecución que se está editando (`null` = modal cerrado). */
  const [editingSegment, setEditingSegment] = useState<{ moduleId: string; segment: ProjectModuleSegment } | null>(null);
  const [assigningTasks, setAssigningTasks] = useState<{
    moduleId: string; teamId: string; focusKey?: string;
  } | null>(null);
  const [planningBlock, setPlanningBlock] = useState<{
    moduleId: string; teamId: string; name: string; estimatedHours?: number | null;
    initialStartDate?: string; initialEndDate?: string;
    /** Fase recién creada: permite mostrar el modal sin esperar el refetch del proyecto. */
    phaseName?: string;
  } | null>(null);
  const [planningMode, setPlanningMode] = useState(
    () => canManage && project.modules.length === 0,
  );
  const [addingPhase, setAddingPhase] = useState(false);
  const [needsTeamsModal, setNeedsTeamsModal] = useState(false);
  const [addingTask, setAddingTask] = useState<{ moduleId: string; segmentId?: string } | null>(null);
  const [editingTask, setEditingTask] = useState<{ moduleId: string; task: ProjectModuleTask } | null>(null);
  const [duplicatingTask, setDuplicatingTask] = useState<{ moduleId: string; task: ProjectModuleTask } | null>(null);
  const [newPhaseName, setNewPhaseName] = useState('');
  const [phaseNameDrafts, setPhaseNameDrafts] = useState<Record<string, string>>({});
  const [creatingFromReference, setCreatingFromReference] = useState<{
    moduleId: string | null;
    task: AppliedQuotationPlanning['modules'][number]['tasks'][number];
    mode?: 'create' | 'edit';
  } | null>(null);
  const onCreateWorkBlock = async (input: WorkBlockFormInput) => {
    if (!planningBlock) return;
    const { closingDelivery, ...data } = input;
    const createInput: CreateProjectModuleSegmentInput = {
      ...data, members: [], ...(closingDelivery ? { closingDelivery } : {}),
    };
    try {
      await createSegment.mutateAsync({
        projectId: project.id, moduleId: planningBlock.moduleId, input: createInput,
      });
      setPlanningBlock(null);
      toast.success('Bloque de trabajo creado.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo crear el bloque.');
    }
  };

  const onEditWorkBlock = async (input: WorkBlockFormInput) => {
    if (!editingSegment) return;
    const updateInput: UpdateProjectModuleSegmentInput = input;
    try {
      await updateSegment.mutateAsync({
        projectId: project.id, moduleId: editingSegment.moduleId,
        segmentId: editingSegment.segment.id, input: updateInput,
      });
      setEditingSegment(null);
      toast.success('Bloque de trabajo actualizado.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo actualizar el bloque.');
    }
  };

  const changeClosure = async (
    moduleId: string, segment: ProjectModuleSegment, action: 'close' | 'reopen', close: () => void,
  ) => {
    try {
      await updateSegment.mutateAsync({
        projectId: project.id, moduleId, segmentId: segment.id,
        input: { closureAction: action },
      });
      close();
      toast.success(action === 'reopen' ? 'Bloque reabierto.' : 'Bloque cerrado.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo cambiar el cierre.');
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

  const onRemoveTask = async (module: ProjectModule, task: ProjectModuleTask) => {
    if (!await confirm({
      title: 'Eliminar tarea',
      description: 'Se eliminará «' + task.name + '», ' +
        (task.assigneeName ? 'asignada a ' + task.assigneeName + '.' : 'sin asignar.') +
        ' Las referencias de cotización, si existen, se conservan.',
      confirmLabel: 'Eliminar tarea', cancelLabel: 'Volver', confirmVariant: 'secondary',
    })) return;
    try {
      await deleteTask.mutateAsync({ projectId: project.id, moduleId: module.id, taskId: task.id });
      toast.success('Tarea eliminada.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo eliminar la tarea.');
    }
  };

  /** Primero se crea la fase macro SIN HH ficticias; después se planifica
   * su primer bloque con fechas y HH reales, como el prototipo v5. */
  const onCreatePhase = async () => {
    const name = newPhaseName.trim();
    if (!name) return toast.error('Escribe el nombre de la fase.');
    try {
      const created = await createModule.mutateAsync({
        projectId: project.id,
        input: { name, initialStage: 'discovery' },
      });
      setAddingPhase(false);
      setNewPhaseName('');
      if (teamOptions.length > 0) {
        setPlanningBlock({
          moduleId: created.id,
          phaseName: name,
          teamId: teamOptions[0]!.value,
          name: '',
        });
        toast.success('Fase creada. Ahora agrega su primer bloque de trabajo.');
      } else {
        setNeedsTeamsModal(true);
        toast.success('Fase creada. Ahora asigna un equipo para planificar bloques de trabajo.');
      }
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
      setNeedsTeamsModal(true);
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

  /** Periodo real de los bloques cuando existen; estimaciones del módulo como respaldo.
   * HH del módulo si están registradas, o suma de bloques SOLO si todos tienen HH. */
  const renderPhaseHeaderName = (phase: { id: string }) => {
    const module = modulesById.get(phase.id);
    if (!module) return null;
    return <span className={[styles.phaseHeadingIdentity,
      planningMode && canManage ? styles.phaseHeadingIdentityPlanning : ''].filter(Boolean).join(' ')}>
      {!canManage || !planningMode
        ? <strong className={styles.headerPhaseName}>{module.name}</strong>
        : <input
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
          />}
      <span className={styles.phaseHeadingMeta}>{phaseHeaderMeta(module)}</span>
    </span>;
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

  /** En v5.02 los bloques/HH de la cotización siguen siendo referencias hasta
   * crear el segmento real. No asignamos fechas, responsables ni estados falsos. */
  const referenceIsConverted = (
    module: ProjectModule,
    reference: AppliedQuotationPlanning['modules'][number]['tasks'][number],
  ) => module.tasks.some((task) => task.description?.includes(
    'Referencia cotización ' + appliedPlanning.data?.versionId +
    ' · WBS ' + reference.wbs + ' · ' + reference.role,
  ));

  const referenceIsExcluded = (
    module: ProjectModule,
    reference: AppliedQuotationPlanning['modules'][number]['tasks'][number],
  ) => roadmapExclusions.data?.some((item) =>
    item.moduleId === module.id && item.versionId === appliedPlanning.data?.versionId &&
    item.wbs === reference.wbs && item.role === reference.role,
  ) ?? false;

  const referenceIsPending = (
    module: ProjectModule,
    reference: AppliedQuotationPlanning['modules'][number]['tasks'][number],
  ) => !referenceIsConverted(module, reference) && !referenceIsExcluded(module, reference);

  const onDiscardReference = async (
    module: ProjectModule,
    reference: AppliedQuotationPlanning['modules'][number]['tasks'][number],
  ) => {
    if (!appliedPlanning.data || !await confirm({
      title: 'Eliminar tarea',
      description: 'Se quitará «' + reference.name +
        '», sin asignar, del Roadmap operativo. La cotización original se conserva.',
      confirmLabel: 'Eliminar tarea', cancelLabel: 'Volver', confirmVariant: 'secondary',
    })) return;
    try {
      await excludeRoadmapReference.mutateAsync({
        projectId: project.id, moduleId: module.id,
        input: { versionId: appliedPlanning.data.versionId,
          wbs: reference.wbs, role: reference.role },
      });
      toast.success('Tarea quitada del Roadmap. La referencia comercial permanece intacta.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No fue posible quitar la referencia.');
    }
  };

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
          missingBlockMessage: appliedPlanning.data?.status === 'accepted_for_planning_only'
            ? 'La estimación aún es planificación preliminar: falta aprobación comercial y traspaso.'
            : project.status === 'active' && (project.startDate || project.hito0At)
              ? 'Bloque de cotización traspasada pendiente de materializar. Revisa el evento del calendario.'
              : 'Se generará automáticamente al iniciar el proyecto.',
        };
      });
  };

  /** Contadores de la vista operativa: tareas existentes + referencias EDT
   * no convertidas. Nunca contamos dos veces una referencia ya creada. */
  const operationalCounts = project.modules.reduce((total, module) => {
    const reference = appliedPlanning.data?.modules.find((entry) => entry.moduleId === module.id);
    total.tasks += module.tasks.length +
      (reference?.tasks.filter((task) => referenceIsPending(module, task)).length ?? 0);
    total.blocks += module.segments.length + getOperationalRows({ id: module.id }).length;
    return total;
  }, { tasks: 0, blocks: 0 });

  /** Roadmap y Avance del equipo presentan el mismo avance operativo por bloque. */
  const getOperationalMetrics = (phase: { id: string }, row: { id?: string }) => {
    const segment = modulesById.get(phase.id)?.segments.find((item) => item.id === row.id);
    return roadmapBlockMetrics(segment ? blockProgressById.get(segment.id) : undefined);
  };

  const renderOperationalContent = (phase: { id: string }) => {
    const module = modulesById.get(phase.id);
    if (!module) return null;
    const commercial = appliedPlanning.data?.modules.find((entry) => entry.moduleId === module.id);
    const references = commercial?.tasks.filter((task) => referenceIsPending(module, task)) ?? [];
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
    return <div className={styles.operationalContent}>
      {Array.from(groups, ([id, group]) => {
        const team = project.teams.find((entry) => entry.teamId === id);
        const teamName = team?.teamName ?? teamOptions.find((entry) => entry.value === id)?.label ??
          'Equipo sin vincular';
        const members = project.members.filter((member) =>
          member.teamId === id && member.userStatus === 'active' && !member.blockedAt);
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
          {canManage && members.length > 0 && <Button size="sm" variant="secondary"
            onClick={() => setAssigningTasks({ moduleId: module.id, teamId: id })}>
            Asignar tareas
          </Button>}
        </div>;
      })}
      <ProjectPhaseTasksTable
        module={module} teams={project.teams} teamOptions={teamOptions}
        commercial={commercial} quotationVersionId={appliedPlanning.data?.versionId}
        references={references} canManage={canManage}
        referenceDeletePending={excludeRoadmapReference.isPending}
        onReviewTask={(task) => reviewActions(module.id, task)}
        onEditTask={(task) => setEditingTask({ moduleId: module.id, task })}
        onDuplicateTask={(task) => setDuplicatingTask({ moduleId: module.id, task })}
        onDeleteTask={(task) => void onRemoveTask(module, task)}
        onEditReference={(task) => setCreatingFromReference({ moduleId: module.id, task, mode: 'edit' })}
        onDeleteReference={(task) => void onDiscardReference(module, task)}
        onAddTask={() => setAddingTask({ moduleId: module.id })}
      />
    </div>;
  };

  const renderSelectionDetail = (phase: { id: string }, selection: PhaseRoadmapSelection, close: () => void) => {
    const module = modulesById.get(phase.id);
    if (!module) return null;
    if (selection.kind === 'incident') return <IncidentsDetail module={module} hourEntries={hourEntries} onClose={close} />;
    if (selection.kind === 'reference-block') {
      const commercial = appliedPlanning.data?.modules.find((entry) => entry.moduleId === module.id);
      const block = commercial?.relativeTeamBlocks?.find((entry) => entry.teamId === selection.id);
      return block && commercial && appliedPlanning.data ? (
        <ReferenceBlockDrawer project={project} module={module}
          block={block} reference={{ ...commercial,
            tasks: commercial.tasks.filter((task) => referenceIsPending(module, task)),
          }} versionId={appliedPlanning.data.versionId}
          onClose={close}
          onPlan={canManage ? () => {
            setPlanningBlock({ moduleId: module.id, teamId: block.teamId,
              name: module.name + ' · ' + (teamOptions.find((item) =>
                item.value === block.teamId)?.label ?? 'Equipo'), estimatedHours: block.hours });
            close();
          } : undefined}
          onCreateReference={canManage ? (task) => {
            setAssigningTasks({ moduleId: module.id, teamId: block.teamId,
              focusKey: 'ref:' + task.wbs + ':' + task.role });
            close();
          } : undefined}
          onEditTask={canManage ? (task) => { setEditingTask({ moduleId: module.id, task }); close(); } : undefined}
          onDuplicateTask={canManage ? (task) => {
            setDuplicatingTask({ moduleId: module.id, task }); close();
          } : undefined}
        />
      ) : null;
    }
    if (selection.kind === 'segment') {
      const segment = module.segments.find((s) => s.id === selection.id);
      return segment ? (
        <SegmentDrawer
          project={project}
          module={module}
          segment={segment}
          reference={appliedPlanning.data?.modules.find((entry) => entry.moduleId === module.id)}
          blockProgress={blockProgressById.get(segment.id)}
          onClose={close}
          onEdit={canManage ? () => {
            // El formulario se abre sobre el panel lateral, que debe continuar
            // visible para conservar el contexto del bloque seleccionado.
            setEditingSegment({ moduleId: module.id, segment });
          } : undefined}
          onChangeClosure={canManage ? (action) => void changeClosure(module.id, segment, action, close) : undefined}
          onDelete={canManage ? () => void onDeleteSegment(module.id, segment, close) : undefined}
          onEditTask={canManage ? (task) => { setEditingTask({ moduleId: module.id, task }); close(); } : undefined}
          onDuplicateTask={canManage ? (task) => {
            setDuplicatingTask({ moduleId: module.id, task }); close();
          } : undefined}
          onDeleteTask={canManage ? (task) => { void onRemoveTask(module, task); close(); } : undefined}
          onAddTask={canManage ? () => {
            setAddingTask({ moduleId: module.id, segmentId: segment.id }); close();
          } : undefined}
          onAssignTasks={canManage ? () => {
            setAssigningTasks({ moduleId: module.id, teamId: segment.teamId });
            close();
          } : undefined}
        />
      ) : null;
    }
    if (selection.kind === 'task') {
      const task = module.tasks.find((t) => t.id === selection.id);
      return task ? <ProjectRoadmapTaskDetail task={task} onClose={close} /> : null;
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
      {project.modules.length === 0 ? (
        <section className={styles.emptyRoadmap} aria-label="Roadmap sin fases">
          <header className={styles.emptyRoadmapTop}>
            <div className={styles.emptyRoadmapCounters} aria-label="Resumen del plan">
              <span>0 fases</span>
              <span>0 bloques de trabajo</span>
              <span>0 tareas</span>
            </div>
            {canManage && (
              <PillSwitcher aria-label="Modo del Roadmap"
                options={[{ value: 'view', label: 'Ver' }, { value: 'plan', label: 'Planificar' }]}
                value={planningMode ? 'plan' : 'view'}
                onChange={(value) => setPlanningMode(value === 'plan')} />
            )}
          </header>
          <p className={styles.emptyRoadmapDefinition}>
            <strong>Bloque de trabajo:</strong> periodo en que un equipo trabaja en una fase, con sus horas estimadas.
            Cada bloque cierra con una sola entrega; si se necesita otra entrega, se crea otro bloque.
          </p>
          <Card className={styles.emptyRoadmapCard}>
            <h2>Arma el plan del proyecto</h2>
            <ol className={styles.emptyRoadmapSteps}>
              <li>
                <span className={styles.emptyRoadmapStepNumber}>1</span>
                <strong>Crea una fase</strong>
                <p>La etapa macro del proyecto, por ejemplo «Calculadora de estimaciones».</p>
              </li>
              <li>
                <span className={styles.emptyRoadmapStepNumber}>2</span>
                <strong>Agrega bloques de trabajo</strong>
                <p>Qué equipo trabaja, entre qué fechas, cuántas horas y qué entrega lo cierra.</p>
              </li>
              <li>
                <span className={styles.emptyRoadmapStepNumber}>3</span>
                <strong>Desglosa en tareas</strong>
                <p>Opcional. Las tareas aprobadas mueven el avance antes de la entrega.</p>
              </li>
            </ol>
            {canManage ? (
              <div className={styles.emptyRoadmapActions}>
                <Button onClick={() => {
                  setPlanningMode(true);
                  setAddingPhase(true);
                }}>Crear la primera fase</Button>
              </div>
            ) : (
              <p className={styles.emptyRoadmapReadOnly}>
                El responsable del proyecto debe crear la primera fase para comenzar la planificación.
              </p>
            )}
          </Card>
        </section>
      ) : (
      <PhaseRoadmap alwaysExpanded operationalView borderlessSummary phaseRoadmap={phaseRoadmap}
        operationalTaskCount={operationalCounts.tasks} operationalBlockCount={operationalCounts.blocks}
        operationalPresaleHours={project.prospectPhaseHours}
        operationalRows={getOperationalRows}
        operationalMetrics={getOperationalMetrics}
        operationalNotice={canManage && pendingReview.length > 0 ? (
          <section className={styles.reviewNotice} aria-label="Tareas por aprobar">
            <header className={styles.reviewNoticeHead}>
              <strong>Tareas por aprobar ({pendingReview.length})</strong>
              <small>El colaborador las marcó como terminadas. Al aprobarlas, suman al avance.</small>
            </header>
            {pendingReview.map(({ moduleId, moduleName, task }) => (
              <div className={styles.reviewNoticeRow} key={task.id}>
                <div>
                  <strong>{task.name}</strong>
                  <small>{task.assigneeName ?? 'Sin responsable'} · {moduleName}.
                    {task.estimatedHours == null ? '' : ' ' + task.estimatedHours + ' HH estimadas.'}
                  </small>
                </div>
                {reviewActions(moduleId, task)}
              </div>
            ))}
          </section>
        ) : undefined}
        operationalFooter={canManage && planningMode ? <Button variant="tertiary" size="sm"
          onClick={() => setAddingPhase(true)}>+ Agregar fase</Button> : undefined}
        onPlanOperationalRow={canManage && planningMode ? (phase, row) => {
          const module = modulesById.get(phase.id);
          const reference = appliedPlanning.data?.modules.find((item) => item.moduleId === phase.id)
            ?.relativeTeamBlocks?.find((block) => block.teamId === row.id);
          if (module && reference) {
            setPlanningBlock({
              moduleId: module.id, teamId: reference.teamId,
              name: module.name + ' · ' +
                (teamOptions.find((item) => item.value === reference.teamId)?.label ?? 'Equipo'),
              estimatedHours: reference.hours,
            });
          }
        } : undefined}
        renderPhaseReferences={renderOperationalContent}
        renderSelectionDetail={renderSelectionDetail}
        renderPhaseHeaderName={renderPhaseHeaderName}
        renderPhaseHeaderActions={renderPhaseHeaderActions}
        toolbarActions={canManage ? (
          <PillSwitcher aria-label="Modo del Roadmap"
            options={[{ value: 'view', label: 'Ver' }, { value: 'plan', label: 'Planificar' }]}
            value={planningMode ? 'plan' : 'view'}
            onChange={(value) => setPlanningMode(value === 'plan')} />
        ) : undefined} />
      )}
      {creatingFromReference && appliedPlanning.data && (
        <QuotationReferenceTaskModal
          key={creatingFromReference.task.wbs + ':' + creatingFromReference.task.role}
          project={project}
          moduleId={creatingFromReference.moduleId}
          versionId={appliedPlanning.data.versionId}
          versionNumber={appliedPlanning.data.versionNumber}
          reference={creatingFromReference.task}
          mode={creatingFromReference.mode ?? 'create'}
          onClose={() => setCreatingFromReference(null)}
        />
      )}
      {assigningTasks && appliedPlanning.data && modulesById.get(assigningTasks.moduleId) && (
        <AssignBlockTasksModal
          key={assigningTasks.moduleId + ':' + assigningTasks.teamId + ':' + (assigningTasks.focusKey ?? '')}
          project={project} module={modulesById.get(assigningTasks.moduleId)!}
          teamId={assigningTasks.teamId}
          referenceTasks={(appliedPlanning.data.modules.find((item) => item.moduleId === assigningTasks.moduleId)
            ?.tasks ?? []).filter((task) => task.teamId === assigningTasks.teamId &&
              referenceIsPending(modulesById.get(assigningTasks.moduleId)!, task))}
          versionId={appliedPlanning.data.versionId}
          focusKey={assigningTasks.focusKey}
          onClose={() => setAssigningTasks(null)}
        />
      )}
      {confirmationDialog}
      <ReviewActionModal open={Boolean(reviewTarget && reviewing)}
        action={reviewTarget?.action ?? 'approve'}
        title={reviewTarget?.action === 'reject' ? 'Devolver tarea' : 'Aprobar tarea'}
        confirmLabel={reviewTarget?.action === 'reject' ? 'Devolver' : 'Aprobar'}
        summary={[
          { label: 'Tarea', value: reviewing?.name ?? '—' },
          { label: 'Colaborador', value: reviewing?.assigneeName ?? 'Sin responsable' },
          { label: 'HH estimadas', value: reviewing?.estimatedHours == null ?
            'Sin definir' : reviewing.estimatedHours + ' HH' },
        ]}
        submitting={updateTask.isPending}
        onCancel={() => setReviewTarget(null)}
        onConfirm={(reason) => void confirmReview(reason)} />
      {addingTask && <NewOperationalTaskModal
        key={addingTask.moduleId + ':' + (addingTask.segmentId ?? '')}
        project={project} moduleId={addingTask.moduleId}
        initialSegmentId={addingTask.segmentId}
        onClose={() => setAddingTask(null)} />}
      {editingTask && <ExecutionTaskModal
        key={editingTask.task.id} project={project} moduleId={editingTask.moduleId}
        task={editingTask.task} onClose={() => setEditingTask(null)}
        onDuplicate={() => {
          setDuplicatingTask(editingTask);
          setEditingTask(null);
        }} />}
      {duplicatingTask && <DuplicateTaskModal
        key={duplicatingTask.task.id} project={project} moduleId={duplicatingTask.moduleId}
        task={duplicatingTask.task} onClose={() => setDuplicatingTask(null)} />}
      <Modal open={addingPhase} title="Nueva fase"
        className={styles.phaseCreationModal}
        description="La etapa macro del plan. Después le agregas bloques de trabajo por equipo."
        onClose={() => setAddingPhase(false)}
        dismissible={!createModule.isPending}
        footer={<>
          <Button variant="outline" onClick={() => setAddingPhase(false)}
            disabled={createModule.isPending}>Cancelar</Button>
          <Button onClick={() => void onCreatePhase()} loading={createModule.isPending}
            disabled={!newPhaseName.trim()}>
            Crear fase
          </Button>
        </>}>
        <div className={styles.phaseCreationForm}>
          <TextField label="Nombre de la fase" required maxLength={300}
            placeholder="Ej. Calculadora de estimaciones" value={newPhaseName}
            onChange={(event) => setNewPhaseName(event.target.value)} />
        </div>
      </Modal>
      <Modal open={needsTeamsModal} title="Primero agrega equipos"
        className={styles.missingTeamsModal}
        onClose={() => setNeedsTeamsModal(false)}
        footer={<>
          {onNavigateToTeams && (
            <Button onClick={() => {
              setNeedsTeamsModal(false);
              onNavigateToTeams();
            }}>Ir a Equipos asignados</Button>
          )}
          <Button variant="outline" onClick={() => setNeedsTeamsModal(false)}>
            Entendido
          </Button>
        </>}>
        <p>El proyecto no tiene equipos asignados. Agrégalos en Equipos asignados
          antes de crear bloques de trabajo.</p>
      </Modal>
      {planningBlock && (modulesById.get(planningBlock.moduleId) || planningBlock.phaseName) && (
        <NewWorkBlockModal
          key={planningBlock.moduleId + ':' + planningBlock.teamId}
          project={project}
          module={modulesById.get(planningBlock.moduleId) ?? {
            id: planningBlock.moduleId,
            name: planningBlock.phaseName!,
          }}
          teamOptions={teamOptions}
          initialTeamId={planningBlock.teamId}
          initialName={planningBlock.name}
          initialEstimatedHours={planningBlock.estimatedHours}
          initialStartDate={planningBlock.initialStartDate}
          initialEndDate={planningBlock.initialEndDate}
          submitting={createSegment.isPending}
          onCancel={() => setPlanningBlock(null)}
          onConfirm={(input) => void onCreateWorkBlock(input)}
        />
      )}
      {editingSegment && modulesById.get(editingSegment.moduleId) && (
        <NewWorkBlockModal
          mode="edit"
          key={'edit:' + editingSegment.segment.id}
          project={project}
          module={modulesById.get(editingSegment.moduleId)!}
          teamOptions={teamOptions}
          initialSegment={editingSegment.segment}
          initialDelivery={modulesById.get(editingSegment.moduleId)!.deliveries.find(
            (delivery) => delivery.segmentId === editingSegment.segment.id)}
          submitting={updateSegment.isPending}
          onCancel={() => setEditingSegment(null)}
          onConfirm={(input) => void onEditWorkBlock(input)}
        />
      )}
    </>
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
