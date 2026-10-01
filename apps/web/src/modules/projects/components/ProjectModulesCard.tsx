import { useMemo, useState, type ReactNode } from 'react';
import {
  PROJECT_MODULE_DELIVERY_STATUS_LABELS,
  PROJECT_MODULE_STAGES,
  PROJECT_MODULE_STAGE_LABELS,
  PROJECT_MODULE_TASK_SCOPE_LABELS,
  PROJECT_MODULE_TASK_STATUS_LABELS,
  type HourEntrySummary,
  type ProjectDetail,
  type ProjectModule,
  type ProjectModuleDelivery,
  type ProjectModuleSegment,
  type ProjectModuleStage,
  type ProjectModuleTask,
} from '@kora/contracts';
import styles from './ProjectModulesCard.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Select';
import { Avatar } from '@/shared/components/ui/Avatar';
import { Badge, type BadgeTone } from '@/shared/components/ui/Badge';
import { CloseIcon, PencilIcon } from '@/shared/components/icons/Icons';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';
import { PhaseRoadmap, type PhaseRoadmapSelection } from '@/modules/client-portal/components/PhaseRoadmap';
import { roleFromTeamName, toPhaseRoadmap } from '@/modules/client-portal/adapters/project-detail.adapter';
import { PHASE_ROADMAP_ROLE_COLORS } from '@/modules/client-portal/types';
import { useUpdateProjectModule, useUpdateProjectModuleSegment } from '../api/projects.queries';
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
  const updateModule = useUpdateProjectModule();
  const updateSegment = useUpdateProjectModuleSegment();
  const phaseRoadmap = useMemo(() => toPhaseRoadmap(project), [project]);
  const modulesById = useMemo(() => new Map(project.modules.map((module) => [module.id, module])), [project.modules]);

  /** Tiempo de ejecución que se está editando (`null` = modal cerrado). */
  const [editingSegment, setEditingSegment] = useState<{ moduleId: string; segment: ProjectModuleSegment } | null>(null);
  // Estable mientras el modal está abierto: `ExecutionSegmentModal` reinicia su formulario cuando cambia `initialValues`,
  // y un refetch del proyecto (re-render de esta tarjeta) no debe borrar lo que se está escribiendo.
  const segmentModalInitialValues = useMemo<ExecutionSegmentModalValues>(
    () => (editingSegment ? segmentToModalValues(editingSegment.segment) : EMPTY_EXECUTION_SEGMENT_MODAL_VALUES),
    [editingSegment],
  );
  // El equipo actual del tramo siempre es elegible, aunque ya no figure entre los equipos del proyecto.
  const segmentModalTeamOptions = useMemo(() => {
    if (!editingSegment || teamOptions.some((option) => option.value === editingSegment.segment.teamId)) return [...teamOptions];
    return [{ value: editingSegment.segment.teamId, label: editingSegment.segment.teamName }, ...teamOptions];
  }, [editingSegment, teamOptions]);

  const onConfirmSegmentEdit = async (values: ExecutionSegmentModalValues) => {
    if (!editingSegment) return;
    try {
      await updateSegment.mutateAsync({
        projectId: project.id,
        moduleId: editingSegment.moduleId,
        segmentId: editingSegment.segment.id,
        input: toSegmentInput(values),
      });
      setEditingSegment(null);
      toast.success('Tiempo de ejecución actualizado.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo guardar el tiempo de ejecución.');
    }
  };

  const onChangeStage = async (moduleId: string, currentStage: ProjectModuleStage) => {
    try {
      await updateModule.mutateAsync({ projectId: project.id, moduleId, input: { currentStage } });
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo actualizar la etapa.');
    }
  };

  if (project.modules.length === 0) {
    return (
      <Card>
        <p className={styles.empty}>Aún no hay fases. Se agregan desde "Editar proyecto".</p>
      </Card>
    );
  }

  const renderPhaseExtras = (phase: { id: string }) => {
    const module = modulesById.get(phase.id);
    if (!module) return null;
    return (
      <div className={styles.moduleFields}>
        <Select
          className={styles.moduleStageField}
          label="Etapa actual"
          options={STAGE_OPTIONS}
          value={module.currentStage}
          disabled={!canManage}
          onChange={(event) => void onChangeStage(module.id, event.target.value as ProjectModuleStage)}
        />
        <Meta label="Etapa inicial" value={PROJECT_MODULE_STAGE_LABELS[module.initialStage]} />
        <Meta label="Horas estimadas" value={module.estimatedHours != null ? `${module.estimatedHours} hh` : 'Sin definir'} />
        <Meta label="Fechas estimadas" value={`${formatDate(module.estimatedStartDate)} — ${formatDate(module.estimatedEndDate)}`} />
        {module.progress.actual != null && (
          <Meta label="Avance real · esperado" value={`${module.progress.actual}% · ${module.progress.expected ?? 0}%`} />
        )}
      </div>
    );
  };

  const renderSelectionDetail = (phase: { id: string }, selection: PhaseRoadmapSelection, close: () => void) => {
    const module = modulesById.get(phase.id);
    if (!module) return null;
    if (selection.kind === 'incident') return <IncidentsDetail module={module} hourEntries={hourEntries} onClose={close} />;
    if (selection.kind === 'segment') {
      const segment = module.segments.find((s) => s.id === selection.id);
      return segment ? (
        <SegmentDetail
          segment={segment}
          onClose={close}
          onEdit={canManage ? () => setEditingSegment({ moduleId: module.id, segment }) : undefined}
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
      <PhaseRoadmap phaseRoadmap={phaseRoadmap} renderPhaseExtras={renderPhaseExtras} renderSelectionDetail={renderSelectionDetail} />
      <ExecutionSegmentModal
        open={editingSegment !== null}
        mode="edit"
        teamOptions={segmentModalTeamOptions}
        initialValues={segmentModalInitialValues}
        submitting={updateSegment.isPending}
        onCancel={() => setEditingSegment(null)}
        onConfirm={(values) => void onConfirmSegmentEdit(values)}
      />
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span className={styles.moduleMeta}>
      <b className={styles.moduleMetaLabel}>{label}</b>
      {value}
    </span>
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

function SegmentDetail({ segment, onClose, onEdit }: { segment: ProjectModuleSegment; onClose: () => void; onEdit?: () => void }) {
  const state = segmentState(segment);
  const days = calendarDays(segment.startDate, segment.endDate);
  return (
    <DetailPanel
      eyebrow="Tiempo de ejecución"
      title={segment.name}
      teamName={segment.teamName}
      badges={<Badge tone={state.tone}>{state.label}</Badge>}
      onEdit={onEdit}
      editLabel="Editar fechas y colaboradores de este tiempo de ejecución"
      onClose={onClose}
    >
      <Facts>
        <Fact label="Inicio" value={formatDate(segment.startDate)} />
        <Fact label="Término" value={formatDate(segment.endDate)} />
        <Fact label="Duración" value={plural(days, 'día')} />
        <Fact label="Colaboradores" value={segment.members.length > 0 ? String(segment.members.length) : 'Sin asignar'} />
      </Facts>
      {segment.members.length > 0 && (
        <ul className={styles.members}>
          {segment.members.map((member) => (
            <li key={member.teamMemberId} className={styles.member}>
              <Avatar name={member.fullName} size={30} />
              <div className={styles.memberInfo}>
                <span className={styles.memberName}>{member.fullName}</span>
                <span className={styles.memberMeta}>
                  {member.dailyPercent != null ? `${member.dailyPercent}% de su jornada diaria` : 'Sin % asignado — no carga HH al Forecast'}
                </span>
              </div>
              {member.dailyPercent != null && (
                <div className={styles.memberLoad} aria-hidden="true">
                  <span className={styles.memberLoadFill} style={{ width: `${Math.min(member.dailyPercent, 100)}%` }} />
                </div>
              )}
              <span className={styles.memberPercent}>{member.dailyPercent != null ? `${member.dailyPercent}%` : '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </DetailPanel>
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
