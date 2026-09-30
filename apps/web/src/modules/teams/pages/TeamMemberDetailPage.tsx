import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { HOUR_ENTRY_STATUS_LABELS, type HourEntryStatus, type HourEntrySummary, type ProjectSummary } from '@kora/contracts';
import styles from './TeamMemberDetailPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { DEFAULT_PAGE_SIZE, Pagination } from '@/shared/components/ui/Pagination';
import { Select } from '@/shared/components/ui/Select';
import { useTeamDetail } from '../api/teams.queries';
import { useProjectsList } from '@/modules/projects/api/projects.queries';
import { useHourEntriesList } from '@/modules/hours/api/hours.queries';
import { HourEntriesApprovalTable } from '@/modules/hours/components/HourEntriesApprovalTable';
import { HourEntryStatusBadge } from '@/modules/hours/components/HourEntryStatusBadge';
import { ProjectStatusBadge } from '@/modules/projects/components/ProjectStatusBadge';
import { getProjectStageLabel } from '@/modules/projects/lib/project-stage-display';
import { projectPath } from '@/app/router/paths';

const HISTORY_STATUS_OPTIONS = (['approved', 'rejected'] as const).map((status) => ({
  value: status,
  label: HOUR_ENTRY_STATUS_LABELS[status],
}));

const formatDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CL') : '—');
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

/**
 * Ficha de colaborador — réplica de `LiderFichaColaborador` (v1): perfil,
 * proyectos asignados, horas pendientes de aprobación e historial paginado
 * de un miembro concreto del equipo. En la v1 vivía en su propia ruta
 * (`/lider/equipos/:idEquipo/:idColaborador`); aquí cuelga de la ficha de
 * equipo por el mismo criterio de URL que el resto de la v2.
 */
export function TeamMemberDetailPage() {
  const { teamId, memberId } = useParams<{ teamId: string; memberId: string }>();
  const navigate = useNavigate();
  const { data: team, isLoading } = useTeamDetail(teamId ?? null);
  const member = team?.members.find((candidate) => candidate.id === memberId) ?? null;

  const [historyStatus, setHistoryStatus] = useState<Extract<HourEntryStatus, 'approved' | 'rejected'>>('approved');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [projectsPage, setProjectsPage] = useState(1);
  const [projectsPageSize, setProjectsPageSize] = useState(DEFAULT_PAGE_SIZE);

  const { data: memberProjects, isLoading: loadingProjects } = useProjectsList(
    member ? { assignedToUserId: member.userId, page: projectsPage, pageSize: projectsPageSize } : {},
  );
  const { data: history, isLoading: loadingHistory } = useHourEntriesList(
    member
      ? { userId: member.userId, status: historyStatus, page: historyPage, pageSize: historyPageSize, sortField: 'date' }
      : {},
  );

  const projectColumns: Column<ProjectSummary>[] = [
    {
      key: 'name',
      header: 'Nombre',
      render: (project) => (
        <Link to={projectPath(project)} className={styles.link}>
          {project.name}
        </Link>
      ),
    },
    { key: 'client', header: 'Cliente', render: (project) => project.client?.companyName ?? <span className={styles.empty}>—</span> },
    { key: 'status', header: 'Estado', render: (project) => <ProjectStatusBadge status={project.status} /> },
    { key: 'stage', header: 'Etapa', render: (project) => getProjectStageLabel(project) },
    { key: 'startDate', header: 'Inicio', render: (project) => formatDate(project.startDate) },
    { key: 'endDate', header: 'Fin (estimado)', render: (project) => formatDate(project.endDate) },
  ];

  const historyColumns: Column<HourEntrySummary>[] = [
    { key: 'date', header: 'Fecha', render: (entry) => formatDate(entry.date) },
    { key: 'project', header: 'Proyecto', render: (entry) => entry.project?.name ?? <span className={styles.empty}>—</span> },
    { key: 'assignment', header: 'Asignación', render: (entry) => entry.assignment ?? 'Desarrollo' },
    { key: 'category', header: 'Actividad', render: (entry) => entry.category || <span className={styles.empty}>—</span> },
    { key: 'hours', header: 'HH', render: (entry) => formatHours(entry.hours) },
    {
      key: 'status',
      header: 'Estado',
      render: (entry) => (
        <div className={styles.statusCell}>
          <HourEntryStatusBadge status={entry.status} />
          {entry.status === 'rejected' && entry.rejectionReason && (
            <span className={styles.rejectionReason}>Motivo: {entry.rejectionReason}</span>
          )}
        </div>
      ),
    },
  ];

  if (isLoading || !team) {
    return (
      <DashboardLayout title="Colaborador">
        <p>Cargando…</p>
      </DashboardLayout>
    );
  }

  if (!member) {
    return (
      <DashboardLayout title="Colaborador">
        <div className={styles.page}>
          <Button variant="tertiary" size="sm" className={styles.backButton} onClick={() => void navigate('/equipos')}>
            ← Volver a equipos
          </Button>
          <p>No se encontró este colaborador en el equipo.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={member.fullName}>
      <div className={styles.page}>
        <Button variant="tertiary" size="sm" className={styles.backButton} onClick={() => void navigate('/equipos')}>
          ← Volver a equipos
        </Button>

        <Card>
          <h2 className={styles.title}>{member.fullName}</h2>
          <p className={styles.subtitle}>
            {member.position ?? 'Colaborador'} · Equipo {team.name} · {member.weeklyHours} hrs/semana
          </p>

          <h3 className={styles.sectionTitle}>Proyectos asignados</h3>
          <DataTable
            caption="Proyectos asignados"
            columns={projectColumns}
            items={memberProjects?.items ?? []}
            getRowKey={(project) => project.id}
            loading={loadingProjects}
            error={null}
            emptyMessage="No tiene proyectos asignados."
          />

          {memberProjects && (
            <Pagination
              page={projectsPage}
              pageCount={memberProjects.pageCount}
              total={memberProjects.total}
              pageSize={memberProjects.pageSize}
              onPageChange={setProjectsPage}
              onPageSizeChange={(size) => {
                setProjectsPageSize(size);
                setProjectsPage(1);
              }}
            />
          )}
        </Card>

        <Card>
          <h2 className={styles.title}>Horas pendientes de aprobación</h2>
          <HourEntriesApprovalTable
            query={{ userId: member.userId }}
            groupByUser={false}
            showTeamColumn={false}
            emptyMessage="No tiene horas pendientes de aprobación."
          />
        </Card>

        <Card>
          <div className={styles.historyHeader}>
            <h2 className={styles.title}>Historial de registros</h2>
            <Select
              className={styles.historyFilter}
              label="Estado"
              options={HISTORY_STATUS_OPTIONS}
              value={historyStatus}
              onChange={(event) => {
                setHistoryStatus(event.target.value as 'approved' | 'rejected');
                setHistoryPage(1);
              }}
            />
          </div>

          <DataTable
            caption="Historial de registros"
            columns={historyColumns}
            items={history?.items ?? []}
            getRowKey={(entry) => entry.id}
            loading={loadingHistory}
            error={null}
            emptyMessage="No hay registros para este filtro."
          />

          {history && (
            <Pagination
              page={historyPage}
              pageCount={history.pageCount}
              total={history.total}
              pageSize={history.pageSize}
              onPageChange={setHistoryPage}
              onPageSizeChange={(size) => {
                setHistoryPageSize(size);
                setHistoryPage(1);
              }}
            />
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
