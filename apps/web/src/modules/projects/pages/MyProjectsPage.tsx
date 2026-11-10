import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PROJECT_PHASE_LABELS, PROJECT_STATUS_LABELS, type CollaboratorProjectSummary } from '@kora/contracts';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { Pagination } from '@/shared/components/ui/Pagination';
import { TextField } from '@/shared/components/ui/TextField';
import { SearchIcon, ChevronRightIcon } from '@/shared/components/icons/Icons';
import { myProjectPath } from '@/app/router/paths';
import { useMyProjects } from '../api/projects.queries';
import styles from './MyProjectsPage.module.css';

const date = (iso: string | null) => iso
  ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CL') : '—';
const pct = (value: number | null) => value == null ? 'Sin plan' : value + '%';
const stage = (p: CollaboratorProjectSummary) => p.phase
  ? PROJECT_PHASE_LABELS[p.phase] : PROJECT_STATUS_LABELS[p.status];
const hour = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

export function MyProjectsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { data, isLoading, error } = useMyProjects({
    page, pageSize, search: search.trim() || undefined,
  });
  const columns: Column<CollaboratorProjectSummary>[] = [
    { key: 'project', header: 'Proyecto / Cliente', render: (p) =>
      <Link to={myProjectPath(p)} className={styles.projectLink}>
        <strong>{p.name}</strong>
        <span>{p.client?.companyName ?? 'Sin cliente'}</span>
      </Link> },
    { key: 'leader', header: 'Líder a cargo', render: (p) => p.leader?.fullName ?? '—' },
    { key: 'stage', header: 'Etapa', render: (p) => <span className={styles.stage}>{stage(p)}</span> },
    { key: 'progress', header: 'Avance', render: (p) =>
      <div className={styles.progress}>
        <div className={styles.progressTrack} role="progressbar"
          aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={p.progress.actual ?? undefined}
          aria-label={'Avance de ' + p.name}>
          <span style={{ width: (p.progress.actual ?? 0) + '%' }} />
        </div>
        <strong>{pct(p.progress.actual)}</strong>
      </div> },
    { key: 'hours', header: 'Mis HH semana', align: 'right', render: (p) => hour(p.weekHours) + ' HH' },
    { key: 'end', header: 'Fecha fin', render: (p) =>
      <span className={styles.date}>{date(p.endDate)}</span> },
    { key: 'open', header: 'Ver', align: 'center', render: (p) =>
      <Link to={myProjectPath(p)} aria-label={'Abrir proyecto ' + p.name} className={styles.open}>
        <ChevronRightIcon size={16} />
      </Link> },
  ];
  return <DashboardLayout title="Mis proyectos">
    <div className={styles.page}>
      <Card className={styles.card}>
        <div className={styles.head}>
          <div>
            <h1>Proyectos en los que participo</h1>
            <p>Selecciona un proyecto para ver su avance, roadmap y bitácora.</p>
          </div>
          {!isLoading && data && <span className={styles.count}>{data.total} proyectos</span>}
        </div>
        <TextField label="Buscar proyecto" type="search" iconLeft={<SearchIcon size={16} />}
          placeholder="Buscar por nombre…" value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
        <DataTable caption="Mis proyectos" columns={columns} items={data?.items ?? []}
          getRowKey={(item) => item.id} loading={isLoading}
          error={error ? 'No fue posible cargar los proyectos.' : null}
          emptyMessage="No tienes proyectos asignados con estos filtros." />
        {data && <Pagination page={data.page} pageCount={data.pageCount} total={data.total}
          pageSize={data.pageSize} onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
      </Card>
    </div>
  </DashboardLayout>;
}
