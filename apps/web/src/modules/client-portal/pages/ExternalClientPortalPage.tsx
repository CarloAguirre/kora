import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import styles from './ClientPortalPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Tabs } from '@/shared/components/ui/Tabs';
import { TextField } from '@/shared/components/ui/TextField';
import { Card } from '@/shared/components/ui/Card';
import { KabeliLogo } from '@/shared/components/layout/KabeliLogo';
import { SearchIcon } from '@/shared/components/icons/Icons';
import { ClientCompanyHeader } from '../components/ClientCompanyHeader';
import { PortalTable, type PortalTableColumn } from '../components/PortalTable';
import { StatPill } from '../components/StatPill';
import { StatusPill } from '../components/StatusPill';
import type { ClientProjectRow, ClientSupportContractRow } from '../types';
import { usePortalMe, usePortalProjects, usePortalSupport } from '../api/client-portal.api';
import { portalProjectPath, portalSupportContractPath } from '@/app/router/paths';
import { formatMoney } from '@/shared/lib/format-money';

const formatDate = (s: string | null) => s
  ? new Date(`${s}T00:00:00`).toLocaleDateString('es-CL') : '—';

const HEALTH_NAMES: Record<ClientProjectRow['health'], string> = {
  prospect: 'Prospecto', quoted: 'Cotización', not_started: 'No iniciado',
  active: 'Activo', on_hold: 'Detenido', finished: 'Finalizado', cancelled: 'Cancelado',
};
const STAGE_NAMES: Record<string, string> = {
  discovery: 'Levantamiento', development: 'Desarrollo',
  production: 'Pruebas', pilot: 'Marcha blanca', finished: 'Finalizado',
};

export function ExternalClientPortalPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const supportTab = location.pathname.endsWith('/soporte');
  const { data: identity, isError: identityError } = usePortalMe();
  const { data: projects, isLoading: projectLoading, isError: projectError } = usePortalProjects();
  const { data: plans, isLoading: supportLoading, isError: supportError } = usePortalSupport();
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<string | null>(null);
  const rows: ClientProjectRow[] = useMemo(() => (projects ?? []).map((project) => {
    const health = project.status === 'finished' ? 'finished'
      : project.status === 'cancelled' ? 'cancelled'
      : project.status === 'on_hold' ? 'on_hold'
      : project.salesStage === 'prospect' ? 'prospect'
      : project.salesStage === 'quoted' ? 'quoted'
      : project.status === 'draft' ? 'not_started' : 'active';
    return {
      id: project.id, slug: project.slug, name: project.name,
      leaderName: project.leader?.fullName ?? '—',
      startDate: formatDate(project.startDate), endDate: project.endDate ? formatDate(project.endDate) : null,
      startDateIso: project.startDate, endDateIso: project.endDate, health,
      stageLabel: STAGE_NAMES[project.phase ?? ''] ?? 'Sin etapa',
      progressPercent: project.progress.actual,
    };
  }), [projects]);
  const supportRows: ClientSupportContractRow[] = useMemo(() => (plans ?? []).map((plan) => ({
    id: plan.id, slug: plan.slug, name: plan.name, planType: plan.planType,
    kabeliOwnerName: plan.leaderName ?? '—',
    startDate: formatDate(plan.startDate), endDate: plan.endDate ? formatDate(plan.endDate) : null,
    startDateIso: plan.startDate, endDateIso: plan.endDate,
    contractedHours: plan.summary.contractedHours,
    consumedHours: plan.summary.usedHours, hourValueUf: plan.summary.planValueUf,
    currency: plan.currency, billingState: '—',
    contractStatus: plan.status === 'active' ? 'active' : 'finished',
  })), [plans]);
  const text = search.trim().toLowerCase();
  const filteredProjects = rows.filter((p) =>
    !text || `${p.name} ${p.leaderName}`.toLowerCase().includes(text));
  const filteredPlans = supportRows.filter((p) =>
    (!planFilter || p.planType === planFilter) &&
    (!text || `${p.name} ${p.kabeliOwnerName}`.toLowerCase().includes(text)));
  const projectColumns: PortalTableColumn<ClientProjectRow>[] = [
    { key: 'project', header: 'Proyecto', sortValue: (p) => p.name,
      render: (p) => <Link to={portalProjectPath(p)}>{p.name}</Link> },
    { key: 'leader', header: 'Líder Kabeli', sortValue: (p) => p.leaderName, render: (p) => p.leaderName },
    { key: 'start', header: 'Inicio', sortValue: (p) => p.startDateIso, render: (p) => p.startDate },
    { key: 'end', header: 'Fin', sortValue: (p) => p.endDateIso, render: (p) => p.endDate ?? '—' },
    { key: 'status', header: 'Estado', sortValue: (p) => p.health,
      render: (p) => <StatusPill tone={p.health === 'active' ? 'success' : p.health === 'on_hold' ? 'warning' : 'neutral'}>
        {HEALTH_NAMES[p.health]}
      </StatusPill> },
    { key: 'stage', header: 'Etapa', sortValue: (p) => p.stageLabel, render: (p) => p.stageLabel },
    { key: 'progress', header: 'Avance', sortValue: (p) => p.progressPercent,
      render: (p) => p.progressPercent == null ? '—' : `${p.progressPercent}%` },
  ];
  const supportColumns: PortalTableColumn<ClientSupportContractRow>[] = [
    { key: 'name', header: 'Contrato', sortValue: (p) => p.name,
      render: (p) => <Link to={portalSupportContractPath(p)}>{p.name}</Link> },
    { key: 'owner', header: 'Responsable Kabeli', sortValue: (p) => p.kabeliOwnerName,
      render: (p) => p.kabeliOwnerName },
    { key: 'type', header: 'Tipo', sortValue: (p) => p.planType,
      render: (p) => ({ bundle: 'Bolsa', monthly: 'Mensual', on_demand: 'A demanda' })[p.planType] },
    { key: 'hours', header: 'N° horas', sortValue: (p) => p.contractedHours,
      render: (p) => p.contractedHours ?? '—' },
    { key: 'consumed', header: 'HH consumidas', sortValue: (p) => p.consumedHours,
      render: (p) => p.consumedHours?.toLocaleString('es-CL') ?? '—' },
    { key: 'value', header: 'Valor HH', sortValue: (p) => p.hourValueUf,
      render: (p) => p.hourValueUf != null ? formatMoney(p.hourValueUf, p.currency) : '—' },
    { key: 'status', header: 'Estado', sortValue: (p) => p.contractStatus,
      render: (p) => <StatusPill tone={p.contractStatus === 'active' ? 'success' : 'neutral'}>
        {p.contractStatus === 'active' ? 'Vigente' : 'Finalizado'}
      </StatusPill> },
  ];

  const isLoading = supportTab ? supportLoading : projectLoading;
  const isError = identityError || (supportTab ? supportError : projectError);

  return (
    <DashboardLayout title={supportTab ? 'Soporte' : 'Proyectos'}>
      <div className={styles.page}>
        {identity && <ClientCompanyHeader company={identity.company} contractLabel="Contacto" />}
        <Tabs tabs={[{ id: 'projects', label: 'Proyectos Desarrollo' }, { id: 'support', label: 'Soporte' }]}
          activeId={supportTab ? 'support' : 'projects'}
          onSelect={(id) => navigate(id === 'support' ? '/portal/soporte' : '/portal/proyectos')} />
        {isLoading && <Card><p>Cargando información autorizada…</p></Card>}
        {isError && <Card><p role="alert">No fue posible consultar el portal. Comprueba que tu acceso esté habilitado.</p></Card>}
        {!isLoading && !isError && <>
          <div className={styles.statsRow}>
            {supportTab ? <>
              <StatPill value={supportRows.filter((p) => p.planType === 'bundle').length}
                label="Bolsa" active={planFilter === 'bundle'} onClick={() => setPlanFilter('bundle')}/>
              <StatPill value={supportRows.filter((p) => p.planType === 'monthly').length}
                label="Mensual" active={planFilter === 'monthly'} onClick={() => setPlanFilter('monthly')}/>
              <StatPill value={supportRows.length} label="Ver todos"
                active={planFilter === null} onClick={() => setPlanFilter(null)}/>
            </> : <>
              <StatPill value={rows.length} label="proyectos totales"/>
              <StatPill value={rows.filter((p) => p.health === 'active').length} label="activos"/>
              <StatPill value={rows.filter((p) => p.health === 'on_hold').length} label="con atención"/>
            </>}
            <TextField className={styles.search} type="search" aria-label="Buscar"
              placeholder={supportTab ? 'Buscar contrato' : 'Buscar proyecto o líder'}
              iconLeft={<SearchIcon size={16} />} value={search}
              onChange={(e) => setSearch(e.target.value)} />
          </div>
          {supportTab
            ? <PortalTable items={filteredPlans} columns={supportColumns} getRowKey={(p) => p.id}/>
            : <PortalTable items={filteredProjects} columns={projectColumns} getRowKey={(p) => p.id}/>}
        </>}
        <div className={styles.footer}>
          <span>Diseñado y desarrollado por</span>
          <KabeliLogo className={styles.footerLogo}/>
        </div>
      </div>
    </DashboardLayout>
  );
}
