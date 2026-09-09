import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { SupportPlanType } from '@kora/contracts';
import styles from './ClientPortalPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Tabs } from '@/shared/components/ui/Tabs';
import { KoraLogo } from '@/shared/components/layout/KoraLogo';
import { ClientCompanyHeader } from '../components/ClientCompanyHeader';
import { PortalPreviewNotice } from '../components/PortalPreviewNotice';
import { PortalTable, type PortalTableColumn } from '../components/PortalTable';
import { StatPill } from '../components/StatPill';
import { StatusPill, type StatusPillTone } from '../components/StatusPill';
import { MOCK_CLIENT_COMPANY, MOCK_CLIENT_PROJECTS, MOCK_CLIENT_SUPPORT_CONTRACTS } from '../mocks/client-portal.mocks';
import type { ClientProjectHealth, ClientProjectRow, ClientSupportContractRow } from '../types';

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
 * DATOS: todo viene de `mocks/client-portal.mocks.ts`, no de la API — ver el
 * comentario de ese archivo para qué falta en el backend antes de conectarlo.
 */

const HEALTH_LABEL: Readonly<Record<ClientProjectHealth, string>> = {
  active: 'Activo',
  at_risk: 'En riesgo',
  finished: 'Finalizado',
};

const HEALTH_TONE: Readonly<Record<ClientProjectHealth, StatusPillTone>> = {
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
  /** Rutas reales del portal por defecto. La vista previa de admin
   *  (`ClientPortalPreviewPage`) las reemplaza por `/clientes/:clientId/vista-cliente[...]`,
   *  ya que un admin/PMO no tiene el permiso `projects:read_own_client` que
   *  protege `/portal/*` a propósito — ver `docs/DECISION-PORTAL-CLIENTE.md`. */
  readonly projectsPath?: string;
  readonly supportPath?: string;
  readonly getProjectPath?: (projectId: string) => string;
  readonly getContractPath?: (contractId: string) => string;
  /** Vista previa desde la ficha interna del cliente: mismo aviso que en
   *  `ClientProjectDetailPage` — el contenido sigue siendo el mock de ejemplo. */
  readonly preview?: boolean;
}

export function ClientPortalPage({
  projectsPath = '/portal/proyectos',
  supportPath = '/portal/soporte',
  getProjectPath = (projectId) => `/portal/proyectos/${projectId}`,
  getContractPath = (contractId) => `/portal/soporte/${contractId}`,
  preview = false,
}: ClientPortalPageProps = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab: 'proyectos' | 'soporte' = location.pathname.endsWith('/soporte') ? 'soporte' : 'proyectos';

  return (
    <DashboardLayout title={activeTab === 'proyectos' ? 'Proyectos' : 'Soporte'}>
      <div className={styles.page}>
        {preview && (
          <PortalPreviewNotice>
            Vista previa de cómo ve un cliente esta pantalla — la empresa y los proyectos de abajo son el dato de
            ejemplo "{MOCK_CLIENT_COMPANY.name}", todavía no los datos reales de este cliente.
          </PortalPreviewNotice>
        )}

        <ClientCompanyHeader
          company={MOCK_CLIENT_COMPANY}
          contractLabel={activeTab === 'proyectos' ? 'Contacto' : 'Responsable'}
        />

        <Tabs
          tabs={[
            { id: 'proyectos', label: 'Proyectos Desarrollo' },
            { id: 'soporte', label: 'Soporte' },
          ]}
          activeId={activeTab}
          onSelect={(id) => navigate(id === 'soporte' ? supportPath : projectsPath)}
        />

        {activeTab === 'proyectos' ? (
          <ClientProjectsSection getProjectPath={getProjectPath} />
        ) : (
          <ClientSupportSection getContractPath={getContractPath} />
        )}

        <div className={styles.footer}>
          <span>Diseñado y desarrollado por</span>
          <KoraLogo variant="dark" />
        </div>
      </div>
    </DashboardLayout>
  );
}

function ClientProjectsSection({ getProjectPath }: { getProjectPath: (projectId: string) => string }) {
  const projects = MOCK_CLIENT_PROJECTS;
  const activeCount = projects.filter((p) => p.health === 'active').length;
  const attentionCount = projects.filter((p) => p.health === 'at_risk').length;

  const columns: PortalTableColumn<ClientProjectRow>[] = [
    {
      key: 'name',
      header: 'Proyecto',
      render: (project) => (
        <div className={styles.projectCell}>
          <Link className={styles.projectLink} to={getProjectPath(project.id)}>
            {project.name}
          </Link>
          <span className={styles.projectMeta}>
            {project.phaseCount} fase{project.phaseCount === 1 ? '' : 's'} · {project.tag}
          </span>
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

function ClientSupportSection({ getContractPath }: { getContractPath: (contractId: string) => string }) {
  const contracts = MOCK_CLIENT_SUPPORT_CONTRACTS;
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
        <Link className={styles.contractName} to={getContractPath(c.id)}>
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
    { key: 'hourValue', header: 'Valor HH', render: (c) => c.hourValueUf != null ? `${c.hourValueUf} UF` : '--' },
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
