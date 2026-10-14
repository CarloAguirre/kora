import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ProjectSummary } from '@kora/contracts';
import styles from './ClientDetailPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { PageLoadError } from '@/shared/components/ui/PageLoadError';
import { Card } from '@/shared/components/ui/Card';
import { DataTable, type Column, type SortState } from '@/shared/components/ui/DataTable';
import { DEFAULT_PAGE_SIZE, Pagination, usePaginatedItems } from '@/shared/components/ui/Pagination';
import { Tabs } from '@/shared/components/ui/Tabs';
import { useToast } from '@/shared/components/ui/Toast';
import { TextField } from '@/shared/components/ui/TextField';
import { PencilIcon, PlusIcon, ChevronLeftIcon, SearchIcon, EyeIcon } from '@/shared/components/icons/Icons';
import { ClientStatusBadge } from '../components/ClientStatusBadge';
import { ClientFormDialog } from '../components/ClientFormDialog';
import type { SupportPlanListItem } from '@kora/contracts';
import { useClientDetail } from '../api/clients.queries';
import { useProjectsList } from '@/modules/projects/api/projects.queries';
import { useSupportPlansForClient } from '@/modules/projects/api/support-plan.queries';
import { ProjectStatusBadge } from '@/modules/projects/components/ProjectStatusBadge';
import {
  SupportInvoiceBillingStatusBadge,
  SupportPlanScopeBadge,
  SupportPlanStatusBadge,
  SupportPlanTypeBadge,
} from '@/modules/projects/components/SupportPlanBadges';
import { getProjectStageLabel } from '@/modules/projects/lib/project-stage-display';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { formatMoney } from '@/shared/lib/format-money';
import { clientPortalPreviewPath, projectPath, supportPlanPath } from '@/app/router/paths';


type ProjectTab = 'all' | 'active' | 'draft' | 'on_hold' | 'support' | 'finished' | 'quoted' | 'prospect';

const TAB_LABELS: Readonly<Record<ProjectTab, string>> = {
  all: 'Todos',
  active: 'Activos',
  draft: 'No iniciados',
  on_hold: 'Detenidos',
  support: 'Soporte',
  finished: 'Finalizados',
  quoted: 'Cotización',
  prospect: 'Prospecto',
};

function matchesTab(project: ProjectSummary, tab: ProjectTab): boolean {
  switch (tab) {
    case 'all':
      return true;
    case 'support':
      return project.type === 'support';
    case 'quoted':
    case 'prospect':
      return project.type === 'development' && project.salesStage === tab;
    default:
      return project.status === tab;
  }
}

// Fechas `YYYY-MM-DD`: `T00:00:00` las lee en hora local (sin él, en Chile salían con un día menos).
const formatDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CL') : '—');
/** A diferencia de `formatDate`: agrega la hora local antes de parsear, para que una fecha 'YYYY-MM-DD' no se lea como medianoche UTC y se corra un día atrás en husos horarios negativos (Chile). */
const formatPlanDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CL') : '—');
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return '—';
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  const days = Math.ceil(Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 30) return `${days} días`;
  const months = Math.round(days / 30);
  return months === 1 ? '1 mes' : `${months} meses`;
}

/**
 * Ficha de cliente: datos de la empresa, contactos y sus proyectos —
 * equivalente a `ClienteDetalle` en la v1 (`/clientes/:cliente`), que la v2
 * nunca llegó a construir a pesar de que el backend ya exponía el detalle
 * completo (`useClientDetail`) desde M1.
 */
const NO_SUPPORT_PLANS: readonly SupportPlanListItem[] = [];

export function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const toast = useToast();
  const { data: client, isLoading, error } = useClientDetail(clientId ?? null);
  const { data: projects } = useProjectsList({ clientId: clientId ?? undefined, page: 1, pageSize: 100 });
  const { data: supportPlans, isLoading: loadingSupportPlans } = useSupportPlansForClient(clientId ?? null);
  const { pageItems: pagedSupportPlans, pagination: supportPlansPagination } = usePaginatedItems(supportPlans ?? NO_SUPPORT_PLANS);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<ProjectTab>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ field: 'name', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const allProjects = projects?.items ?? [];

  const tabCounts = useMemo(() => {
    const counts = {} as Record<ProjectTab, number>;
    (Object.keys(TAB_LABELS) as ProjectTab[]).forEach((key) => {
      counts[key] = allProjects.filter((p) => matchesTab(p, key)).length;
    });
    return counts;
  }, [allProjects]);

  const filteredProjects = useMemo(() => {
    let data = allProjects.filter((p) => matchesTab(p, tab));

    if (search.trim()) {
      const query = search.trim().toLowerCase();
      data = data.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.leader?.fullName ?? '').toLowerCase().includes(query) ||
          (p.client?.companyName ?? '').toLowerCase().includes(query),
      );
    }

    const direction = sort.direction === 'asc' ? 1 : -1;
    const sorted = [...data].sort((a, b) => {
      switch (sort.field) {
        case 'startDate':
          return direction * (new Date(a.startDate ?? 0).getTime() - new Date(b.startDate ?? 0).getTime());
        case 'soldHours':
          return direction * (a.soldHours - b.soldHours);
        case 'usedHours':
          return direction * (a.usedHours - b.usedHours);
        default:
          return direction * a.name.localeCompare(b.name, 'es');
      }
    });
    return sorted;
  }, [allProjects, tab, search, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
  const pagedProjects = filteredProjects.slice((page - 1) * pageSize, page * pageSize);

  if (error) {
    return (
      <DashboardLayout title="Cliente">
        <PageLoadError error={error} subject="este cliente" backLabel="Volver a clientes" onBack={() => void navigate('/clientes')} />
      </DashboardLayout>
    );
  }

  if (isLoading || !client || !clientId) {
    return (
      <DashboardLayout title="Cliente">
        <p>Cargando…</p>
      </DashboardLayout>
    );
  }

  const toggleSort = (field: string) => {
    setSort((prev) => (prev.field === field ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { field, direction: 'asc' }));
    setPage(1);
  };

  const columns: Column<ProjectSummary>[] = [
    {
      key: 'name',
      header: 'Nombre Proyecto',
      sortable: true,
      render: (p) => (
        <Link to={projectPath(p)} className={styles.link}>
          {p.name}
        </Link>
      ),
    },
    { key: 'status', header: 'Estado', render: (p) => <ProjectStatusBadge status={p.status} /> },
    { key: 'startDate', header: 'Inicio', sortable: true, render: (p) => formatDate(p.startDate) },
    { key: 'duration', header: 'Duración', render: (p) => formatDuration(p.startDate, p.endDate) },
    { key: 'endDate', header: 'Fin Estimado', render: (p) => formatDate(p.endDate) },
    { key: 'soldHours', header: 'HH Vendidas', sortable: true, render: (p) => formatHours(p.soldHours) },
    { key: 'usedHours', header: 'HH Utilizadas', sortable: true, render: (p) => formatHours(p.usedHours) },
    { key: 'stage', header: 'Etapa', render: (p) => getProjectStageLabel(p) },
  ];

  const supportPlanColumns: Column<SupportPlanListItem>[] = [
    {
      key: 'name',
      header: 'Contrato',
      render: (p) => (
        <Link to={supportPlanPath(p)} className={styles.link}>
          {p.name}
        </Link>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (p) => (
        <div className={styles.supportTypeCell}>
          <SupportPlanTypeBadge planType={p.planType} />
          <SupportPlanScopeBadge scope={p.scope} />
        </div>
      ),
    },
    { key: 'leader', header: 'Responsable Kabeli', render: (p) => p.leaderName ?? '—' },
    {
      key: 'vigencia',
      header: 'Vigencia',
      render: (p) => `${formatPlanDate(p.startDate)} – ${p.endDate ? formatPlanDate(p.endDate) : '—'}`,
    },
    { key: 'contractedHours', header: 'N° Horas', align: 'right', render: (p) => (p.planType === 'on_demand' ? '—' : formatHours(p.contractedHours)) },
    { key: 'usedHours', header: 'HH consumidas', align: 'right', render: (p) => formatHours(p.usedHours) },
    { key: 'planValueUf', header: 'Valor HH', align: 'right', render: (p) => formatMoney(p.planValueUf, p.currency) },
    {
      key: 'billing',
      header: 'Por facturar',
      render: (p) => <SupportInvoiceBillingStatusBadge status={p.currentBillingStatus} />,
    },
    { key: 'status', header: 'Estado del contrato', render: (p) => <SupportPlanStatusBadge status={p.status} /> },
  ];

  return (
    <DashboardLayout title="Clientes">
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <Button variant="ghost" size="icon" onClick={() => void navigate(-1)} aria-label="Volver">
              <ChevronLeftIcon size={20} />
            </Button>
            <h2 className={styles.clientName}>{client.companyName}</h2>
          </div>
          <div className={styles.headerRight}>
            <Link to={clientPortalPreviewPath(client)}>
              <Button variant="outline" iconLeft={<EyeIcon size={18} />}>
                Vista cliente
              </Button>
            </Link>
            {can('projects:manage') && (
              <Link to={`/proyectos/nuevo?clientId=${client.id}`}>
                <Button iconLeft={<PlusIcon size={18} />}>Agregar Proyecto</Button>
              </Link>
            )}
          </div>
        </div>

        <Card>
          <div className={styles.datosHeader}>
            <p className={styles.sectionTitle}>Datos del Cliente</p>
            <div className={styles.datosHeaderRight}>
              <ClientStatusBadge status={client.status} />
              {can('clients:manage') && (
                <Button variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label="Editar cliente" title="Editar">
                  <PencilIcon size={16} />
                </Button>
              )}
            </div>
          </div>

          <div className={styles.datosGrid}>
            <div className={styles.datosCol}>
              <Field label="Empresa" value={client.companyName} />
              <Field label="Razón social" value={client.legalName} />
              <Field label="RUT/Identificador" value={client.taxId} />
              <Field label="Rubro" value={client.industry?.name} />
            </div>
            <div className={styles.datosCol}>
              <Field label="Sitio web" value={client.website} />
              <Field label="Dirección" value={client.address} />
              <Field label="Comuna" value={client.comuna?.name} />
              <Field label="País" value={client.country?.name} />
            </div>
            <div className={styles.datosCol}>
              <Field label="Responsable comercial" value={client.commercialManager?.fullName} />
              {client.contacts.length === 0 && <Field label="Contacto" value={null} />}
              {client.contacts.map((contact) => (
                <div key={contact.id} className={styles.contactBlock}>
                  <Field label="Nombre contacto" value={contact.name} />
                  <Field label="Cargo" value={contact.position} />
                  <Field label="Correo electrónico" value={contact.email} />
                  <Field label="Teléfono" value={contact.phone} />
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <p className={styles.sectionTitle}>Proyectos ({projects?.total ?? 0})</p>

          <div className={styles.projectsToolbar}>
            <Tabs
              tabs={(Object.keys(TAB_LABELS) as ProjectTab[]).map((key) => ({
                id: key,
                label: `${TAB_LABELS[key]} (${tabCounts[key]})`,
              }))}
              activeId={tab}
              onSelect={(id) => {
                setTab(id as ProjectTab);
                setPage(1);
              }}
            />
            <TextField
              className={styles.projectsSearch}
              label="Buscar"
              type="search"
              placeholder="Nombre, cliente o líder"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              iconLeft={<SearchIcon size={16} />}
            />
          </div>

          <DataTable
            caption="Proyectos del cliente"
            columns={columns}
            items={pagedProjects}
            getRowKey={(p) => p.id}
            loading={false}
            error={null}
            sort={sort}
            onSortChange={toggleSort}
            emptyMessage="Este cliente todavía no tiene proyectos."
          />

          <Pagination
            page={page}
            pageCount={pageCount}
            total={filteredProjects.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </Card>

        <Card>
          <p className={styles.sectionTitle}>Contratos de soporte ({supportPlans?.length ?? 0})</p>
          <DataTable
            caption="Contratos de soporte del cliente"
            columns={supportPlanColumns}
            items={pagedSupportPlans}
            getRowKey={(p) => p.id}
            loading={loadingSupportPlans}
            error={null}
            emptyMessage="Este cliente todavía no tiene contratos de soporte."
          />

          <Pagination {...supportPlansPagination} />
        </Card>
      </div>

      <ClientFormDialog
        open={editing}
        clientId={client.id}
        onClose={() => setEditing(false)}
        onSuccess={(message) => {
          toast.success(message);
          setEditing(false);
          void navigate('/clientes');
        }}
      />
    </DashboardLayout>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}:</span>
      <span className={styles.fieldValue}>{value || '—'}</span>
    </div>
  );
}
