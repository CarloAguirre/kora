import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  PROJECT_PHASE_LABELS, PROJECT_STATUS_LABELS,
  type CollaboratorProjectDetail,
} from '@kora/contracts';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { PageLoadError } from '@/shared/components/ui/PageLoadError';
import { ChevronLeftIcon } from '@/shared/components/icons/Icons';
import { PhaseRoadmap, type PhaseRoadmapSelection } from '@/modules/client-portal/components/PhaseRoadmap';
import { ProjectProgressOverview } from '@/modules/client-portal/components/ProjectProgressOverview';
import { toPhaseRoadmap } from '@/modules/client-portal/adapters/project-detail.adapter';
import { useMyProjectDetail } from '../api/projects.queries';
import { calculateOperationalBlockProgress, roadmapBlockMetrics } from '../lib/team-progress';
import { SegmentDrawer } from '../components/SegmentDrawer';
import { ProjectPhaseTasksTable } from '../components/ProjectPhaseTasksTable';
import { ProjectRoadmapTaskDetail } from '../components/ProjectRoadmapTaskDetail';
import { phaseHeaderMeta } from '../lib/phase-header-meta';
import roadmapStyles from '../components/ProjectModulesCard.module.css';
import { MyProjectBitacora } from '../components/MyProjectBitacora';
import styles from './MyProjectDetailPage.module.css';

const date = (value: string | null | undefined) => value
  ? new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CL') : '—';

/** Solo entregas mantienen el detalle simple; las tareas usan la misma tarjeta de Líder/PMO. */
function DeliveryRoadmapDetail({ project, phaseId, selection }: {
  project: CollaboratorProjectDetail;
  phaseId: string;
  selection: PhaseRoadmapSelection;
}) {
  const phase = project.modules.find((module) => module.id === phaseId);
  const delivery = phase?.deliveries.find((item) => selection.kind === 'delivery' && item.id === selection.id);
  if (!delivery) return null;
  return <div className={styles.selection} role="note">
    <strong>{delivery.name ?? 'Entrega'}</strong>
    <span>Responsable: {delivery.assigneeName ?? delivery.teamName ?? '—'}</span>
    <span>Fecha comprometida: {date(delivery.estimatedDate)}</span>
    {delivery.description && <span>{delivery.description}</span>}
  </div>;
}

export function MyProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: project, error, isLoading } = useMyProjectDetail(projectId ?? null);
  const [tab, setTab] = useState<'roadmap' | 'bitacora'>('roadmap');
  const roadmap = useMemo(() => project ? toPhaseRoadmap(project) : null, [project]);
  const blockProgressById = useMemo(() => {
    const blocks = new Map<string, ReturnType<typeof calculateOperationalBlockProgress>>();
    for (const module of project?.modules ?? []) {
      for (const segment of module.segments) {
        blocks.set(segment.id, calculateOperationalBlockProgress(module, segment));
      }
    }
    return blocks;
  }, [project]);

  if (error) return <DashboardLayout title="Mis proyectos">
    <PageLoadError error={error} subject="este proyecto"
      backLabel="Volver a mis proyectos" onBack={() => navigate('/mis-proyectos')} />
  </DashboardLayout>;
  if (isLoading || !project || !roadmap) return <DashboardLayout title="Mis proyectos"><p>Cargando proyecto…</p></DashboardLayout>;

  return <DashboardLayout title="Mis proyectos">
    <div className={styles.page}>
      <Button variant="tertiary" size="sm" className={styles.back}
        onClick={() => navigate('/mis-proyectos')}>
        <ChevronLeftIcon size={16} /> Volver a mis proyectos
      </Button>
      <h1 className={styles.name}>{project.name}</h1>
      <Card className={styles.metadata}>
        <div><small>Cliente</small><strong>{project.client?.companyName ?? 'Sin cliente'}</strong></div>
        <div><small>Líder a cargo</small><strong>{project.leader?.fullName ?? '—'}</strong></div>
        <div><small>Fecha inicio</small><strong>{date(project.startDate)}</strong></div>
        <div><small>Fecha fin</small><strong>{date(project.endDate ?? project.estimatedDeliveryDate)}</strong></div>
        <div><small>Etapa de avance</small><Badge tone="info" className={styles.stageBadge}>
          {project.phase ? PROJECT_PHASE_LABELS[project.phase] : PROJECT_STATUS_LABELS[project.status]}
        </Badge></div>
      </Card>
      <Card className={styles.progressCard}>
        <h2>Avance del proyecto</h2>
        <ProjectProgressOverview bare actualPercent={project.progress.actual}
          expectedPercent={project.progress.expected}
          startDate={date(project.startDate)} endDate={date(project.endDate)} />
      </Card>
      <div className={styles.tabsShell}>
        <div className={styles.tabs} role="tablist" aria-label="Detalle de mi proyecto">
          <button type="button" role="tab" aria-selected={tab === 'roadmap'}
            className={tab === 'roadmap' ? styles.selected : ''}
            onClick={() => setTab('roadmap')}>Roadmap</button>
          <button type="button" role="tab" aria-selected={tab === 'bitacora'}
            className={tab === 'bitacora' ? styles.selected : ''}
            onClick={() => setTab('bitacora')}>Bitácora</button>
        </div>
        <div className={styles.tabsBody}>
          {tab === 'roadmap' ? <>
            {project.modules.length === 0
              ? <p>Este proyecto todavía no tiene fases planificadas.</p>
              : <PhaseRoadmap alwaysExpanded operationalView borderlessSummary
                  phaseRoadmap={roadmap}
                  operationalTaskCount={project.modules.reduce((n, m) => n + m.tasks.filter((t) => !t.cancelledAt).length, 0)}
                  operationalBlockCount={project.modules.reduce((n, m) => n + m.segments.length, 0)}
                  renderPhaseHeaderName={(phase) => {
                    const module = project.modules.find((item) => item.id === phase.id);
                    return module ? <span className={roadmapStyles.phaseHeadingIdentity}>
                      <strong className={roadmapStyles.headerPhaseName}>{module.name}</strong>
                      <span className={roadmapStyles.phaseHeadingMeta}>{phaseHeaderMeta(module)}</span>
                    </span> : null;
                  }}
                  renderPhaseHeaderActions={(phase) => {
                    const module = project.modules.find((item) => item.id === phase.id);
                    if (!module) return null;
                    const actual = module.progress.actual;
                    const expected = module.progress.expected;
                    const pct = (value: number | null) => value == null ? '—' : value + '%';
                    return <div className={roadmapStyles.phaseHeadingActions}>
                      <span className={roadmapStyles.phaseHeadingProgress}>
                        <span className={roadmapStyles.phaseHeadingBar} aria-hidden="true">
                          <span className={roadmapStyles.phaseHeadingReal}
                            style={{ width: Math.max(0, Math.min(100, actual ?? 0)) + '%' }} />
                          {expected !== null && <i className={roadmapStyles.phaseHeadingMarker}
                            style={{ left: Math.max(0, Math.min(100, expected)) + '%' }} />}
                        </span>
                        <span>{pct(actual)} real · {pct(expected)} plan</span>
                      </span>
                    </div>;
                  }}
                  operationalMetrics={(_phase, row) =>
                    roadmapBlockMetrics(row.id ? blockProgressById.get(row.id) : undefined)}
                  renderPhaseReferences={(phase) => {
                    const module = project.modules.find((item) => item.id === phase.id);
                    return module ? (
                      <ProjectPhaseTasksTable module={module} canManage={false} readOnly />
                    ) : null;
                  }}
                  renderSelectionDetail={(phase, selection, clearSelection) => {
                    if (selection.kind === 'segment') {
                      const module = project.modules.find((item) => item.id === phase.id);
                      const segment = module?.segments.find((item) => item.id === selection.id);
                      return module && segment ? (
                        <SegmentDrawer readOnly project={project}
                          module={module} segment={segment}
                          blockProgress={blockProgressById.get(segment.id)}
                          onClose={clearSelection} />
                      ) : null;
                    }
                    if (selection.kind === 'task') {
                      const task = project.modules.find((item) => item.id === phase.id)
                        ?.tasks.find((item) => item.id === selection.id);
                      return task ? <ProjectRoadmapTaskDetail task={task} onClose={clearSelection} /> : null;
                    }
                    return <DeliveryRoadmapDetail project={project} phaseId={phase.id} selection={selection} />;
                  }} />}
          </> : <MyProjectBitacora project={project} />}
        </div>
      </div>
    </div>
  </DashboardLayout>;
}
