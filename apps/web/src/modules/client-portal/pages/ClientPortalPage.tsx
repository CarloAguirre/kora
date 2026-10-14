import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { SupportPlanType } from '@kora/contracts';
import styles from './ClientPortalPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Tabs } from '@/shared/components/ui/Tabs';
import { KabeliLogo } from '@/shared/components/layout/KabeliLogo';
import { ChevronLeftIcon } from '@/shared/components/icons/Icons';
import { useClientDetail } from '@/modules/clients/api/clients.queries';
import { useProjectsList } from '@/modules/projects/api/projects.queries';
import { useSupportPlansForClient } from '@/modules/projects/api/support-plan.queries';
import { ClientCompanyHeader } from '../components/ClientCompanyHeader';
import { PortalTable, type PortalTableColumn } from '../components/PortalTable';
import { StatPill } from '../components/StatPill';
import { StatusPill, type StatusPillTone } from '../components/StatusPill';
import { toClientCompanyInfo, toClientProjectRow, toClientSupportContractRow } from '../adapters/portal-list.adapter';
import type { ClientProjectHealth, ClientProjectRow, ClientSupportContractRow } from '../types';
import { formatMoney } from '@/shared/lib/format-money';
import { portalProjectPath, portalSupportContractPath } from '@/app/router/paths';

/**
 * Portal de cliente — tabs "Proyectos Desarrollo" y "Soporte".
 *
 * Sirve las dos rutas `/portal/proyectos` y `/portal/soporte` (ver
 * `app/router/routes.tsx`): en el Figma de referencia son dos entradas de
 * menú independientes que llevan a la misma pantalla con una pestaña
 * distinta activa, así que aquí la pestaña activa se deriva de la URL en vez
 * de guardarse solo en estado local — al revés de como lo hace
 * `DashboardPage` (que sí tiene una única entrada de menú "Dashboard").
 *
 * DATOS: proyectos vía `useProjectsList({ clientId })`, contratos de soporte
 * vía `useSupportPlansForClient(clientId)` — ver `adapters/portal-list.adapter.ts`.
 */

const HEALTH_LABEL: Readonly<Record<ClientProjectHealth, string>> = {
  prospect: 'Prospecto',
  quoted: 'Cotización',
  not_started: 'No iniciado',
  active: 'Activo',
  at_risk: 'En riesgo',
  finished: 'Finalizado',
};

const HEALTH_TONE: Readonly<Record<ClientProjectHealth, StatusPillTone>> = {
  prospect: 'info',
  quoted: 'info',
  not_started: 'neutral',
  active: 'success',
  at_risk: 'warning',
  finished: 'neutral',
};

const PLAN_TYPE_LABEL: Readonly<Record<SupportPlanType, string>> = {
  monthly: 'Mensual',
  bundle: 'Bolsa',
  on_demand: 'A demanda',
};

export interface ClientPortalPageProps {
  /** Empresa cuyos proyectos/contratos se muestran — sin esto, la lista queda vacía. */
  readonly clientId?: string;
  /** Rutas reales del portal por defecto. La vista previa de admin
   *  (`ClientPortalPreviewPage`) las reemplaza por `/clientes/:clientId/vista-cliente[...]`,
   *  ya que un admin/PMO no tiene el permiso `projects:read_own_client` que
   *  protege `/portal/*` a propósito — ver `docs/DECISION-PORTAL-CLIENTE.md`. */
  readonly projectsPath?: string;
  readonly supportPath?: string;
  readonly getProjectPath?: (project: ClientProjectRow) => string;
  readonly getContractPath?: (contract: ClientSupportContractRow) => string;
  /** Destino del enlace "Volver". Solo lo pasa la vista previa de admin — en el
   *  portal real esta es la pantalla de entrada del cliente, sin página anterior. */
  readonly backTo?: string;
  readonly backLabel?: string;
}

export function ClientPortalPage({
  clientId,
  projectsPath = '/portal/proyectos',
  supportPath = '/portal/soporte',
  getProjectPath = portalProjectPath,
  getContractPath = portalSupportContractPath,
  backTo,
  backLabel,
}: ClientPortalPageProps = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab: 'proyectos' | 'soporte' = location.pathname.endsWith('/soporte') ? 'soporte' : 'proyectos';
  const { data: client } = useClientDetail(clientId ?? null);
  const company = client ? toClientCompanyInfo(client) : { name: '—', contactName: '—', contactPosition: '' };

  return (
    <DashboardLayout title={activeTab === 'proyectos' ? 'Proyectos' : 'Soporte'}>
      <div className={styles.page}>
        {backTo && (
          <Link className={styles.breadcrumb} to={backTo}>
            <ChevronLeftIcon size={16} /> {backLabel ?? 'Volver'}
          </Link>
        )}

        <ClientCompanyHeader company={company} contractLabel={activeTab === 'proyectos' ? 'Contacto' : 'Responsable'} />

        <Tabs
          tabs={[
            { id: 'proyectos', label: 'Proyectos Desarrollo' },
            { id: 'soporte', label: 'Soporte' },
          ]}
          activeId={activeTab}
          onSelect={(id) => navigate(id === 'soporte' ? supportPath : projectsPath)}
        />

        {activeTab === 'proyectos' ? (
          <ClientProjectsSection clientId={clientId} clientOwnerName={company.contactName} getProjectPath={getProjectPath} />
        ) : (
          <ClientSupportSection clientId={clientId} getContractPath={getContractPath} />
        )}

        <div className={styles.footer}>
          <span>Diseñado y desarrollado por</span>
          <KabeliLogo className={styles.footerLogo} />
        </div>
      </div>
    </DashboardLayout>
  );
}

function ClientProjectsSection({
  clientId,
  clientOwnerName,
  getProjectPath,
}: {
  clientId: string | undefined;
  clientOwnerName: string;
  getProjectPath: (project: ClientProjectRow) => string;
}) {
  const { data } = useProjectsList({ clientId: clientId ?? undefined, pageSize: 100 });
  const projects = useMemo(
    () => (data?.items ?? []).map((project) => toClientProjectRow(project, clientOwnerName)),
    [data, clientOwnerName],
  );
  const activeCount = projects.filter((p) => p.health === 'active').length;
  const attentionCount = projects.filter((p) => p.health === 'at_risk').length;

  const columns: PortalTableColumn<ClientProjectRow>[] = [
    {
      key: 'name',
      header: 'Proyecto',
      render: (project) => (
        <div className={styles.projectCell}>
          <Link className={styles.projectLink} to={getProjectPath(project)}>
            {project.name}
          </Link>
          <span className={styles.projectMeta}>{project.typeLabel}</span>
        </div>
      ),
    },
    { key: 'kabeliOwner', header: 'Responsable Kabeli', render: (p) => p.kabeliOwnerName },
    { key: 'clientOwner', header: 'Responsable cliente', render: (p) => p.clientOwnerName },
    {
      key: 'dates',
      header: 'Inicio – Fin',
      render: (p) => `${p.startDate} / ${p.endDate ?? '--'}`,
    },
    {
      key: 'health',
      header: 'Estado',
      render: (p) => <StatusPill tone={HEALTH_TONE[p.health]}>{HEALTH_LABEL[p.health]}</StatusPill>,
    },
    {
      key: 'stage',
      header: 'Etapa',
      render: (p) => (
        <div className={styles.stageCell}>
          <span className={styles.stageLabel}>{p.stageLabel}</span>
          <div className={styles.stageBarTrack}>
            <div className={styles.stageBarFill} style={{ width: `${p.stageProgressPercent}%` }} />
          </div>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className={styles.statsRow}>
        <StatPill value={projects.length} label="proyectos totales" />
        <StatPill value={activeCount} label="activos" />
        <StatPill value={attentionCount} label="con puntos de atención" />
      </div>

      <PortalTable columns={columns} items={projects} getRowKey={(p) => p.id} />
    </>
  );
}

function ClientSupportSection({
  clientId,
  getContractPath,
}: {
  clientId: string | undefined;
  getContractPath: (contract: ClientSupportContractRow) => string;
}) {
  const { data } = useSupportPlansForClient(clientId ?? null);
  const contracts = useMemo(() => (data ?? []).map(toClientSupportContractRow), [data]);
  const [planFilter, setPlanFilter] = useState<SupportPlanType | null>(null);

  const countByPlan = useMemo(() => {
    const counts: Record<SupportPlanType, number> = { monthly: 0, bundle: 0, on_demand: 0 };
    for (const contract of contracts) counts[contract.planType] += 1;
    return counts;
  }, [contracts]);

  const filtered = planFilter ? contracts.filter((c) => c.planType === planFilter) : contracts;

  const columns: PortalTableColumn<ClientSupportContractRow>[] = [
    {
      key: 'name',
      // El nombre del contrato es un enlace en el Figma: lleva al detalle del
      // contrato de soporte (`ClientSupportContractDetailPage`) con su lista
      // de tickets — ver docs/DECISION-PORTAL-CLIENTE.md.
      header: 'Contrato',
      render: (c) => (
        <Link className={styles.contractName} to={getContractPath(c)}>
          {c.name}
        </Link>
      ),
    },
    { key: 'kabeliOwner', header: 'Responsable Kabeli', render: (c) => c.kabeliOwnerName },
    { key: 'planType', header: 'Tipo', render: (c) => PLAN_TYPE_LABEL[c.planType] },
    {
      key: 'dates',
      header: 'Inicio - Término',
      render: (c) => `${c.startDate} / ${c.endDate ?? '--'}`,
    },
    { key: 'contractedHours', header: 'N° horas', render: (c) => c.contractedHours ?? '--' },
    { key: 'consumedHours', header: 'HH consumidas', render: (c) => c.consumedHours != null ? `${c.consumedHours} UF` : '--' },
    { key: 'hourValue', header: 'Valor HH', render: (c) => c.hourValueUf != null ? formatMoney(c.hourValueUf, c.currency) : '--' },
    { key: 'billingState', header: 'Por facturar', render: (c) => c.billingState },
    {
      key: 'status',
      header: 'Estado del contrato',
      render: (c) => (
        <StatusPill tone={c.contractStatus === 'active' ? 'success' : 'neutral'}>
          {c.contractStatus === 'active' ? 'Vigente' : 'Finalizado'}
        </StatusPill>
      ),
    },
  ];

  return (
    <>
      <div className={styles.statsRow}>
        <StatPill value={countByPlan.bundle} label="Bolsa" onClick={() => setPlanFilter('bundle')} active={planFilter === 'bundle'} />
        <StatPill value={countByPlan.monthly} label="Mensual" onClick={() => setPlanFilter('monthly')} active={planFilter === 'monthly'} />
        <StatPill value={countByPlan.on_demand} label="A demanda" onClick={() => setPlanFilter('on_demand')} active={planFilter === 'on_demand'} />
        <StatPill value={contracts.length} label="Ver todos" onClick={() => setPlanFilter(null)} active={planFilter === null} />
      </div>

      <PortalTable columns={columns} items={filtered} getRowKey={(c) => c.id} />
    </>
  );
}
