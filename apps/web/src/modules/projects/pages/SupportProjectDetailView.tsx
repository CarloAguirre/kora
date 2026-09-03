import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProjectDetail, ProjectStatus, TicketSummary } from '@kora/contracts';
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES } from '@kora/contracts';
import styles from './SupportProjectDetailView.module.css';
import detailStyles from './ProjectDetailPage.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { Pagination } from '@/shared/components/ui/Pagination';
import { useToast } from '@/shared/components/ui/Toast';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useClientDetail } from '@/modules/clients/api/clients.queries';
import { useChangeProjectStatus } from '../api/projects.queries';
import { useSupportPlanSummary } from '../api/support-plan.queries';
import { useTicketsList } from '@/modules/tickets/api/tickets.queries';
import { TicketPriorityBadge } from '@/modules/tickets/components/TicketPriorityBadge';
import { SupportHoursDonut } from '../components/SupportHoursDonut';
import { SupportProgressChart } from '../components/SupportProgressChart';

const STATUS_OPTIONS = PROJECT_STATUSES.map((status) => ({ value: status, label: PROJECT_STATUS_LABELS[status] }));
const formatDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CL') : '—');
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const TICKETS_PAGE_SIZE = 25;

/**
 * Ficha de proyecto de soporte — réplica de `FichaProyectoSoporte` (v1), que
 * es una pantalla estructuralmente distinta de la de desarrollo
 * (`LiderProyectoFicha`): sin equipo asignado, sin bitácora, sin línea de
 * tiempo. En su lugar: contacto del cliente, datos del contrato, el estado
 * del plan de soporte como anillo, el historial mensual de consumo, y la
 * tabla completa de tickets del proyecto.
 */
export function SupportProjectDetailView({ project, projectId }: { project: ProjectDetail; projectId: string }) {
  const { can } = usePermissions();
  const toast = useToast();
  const changeStatus = useChangeProjectStatus();
  const { data: client } = useClientDetail(project.client?.id ?? null);
  const { data: supportSummary, isLoading: loadingSummary } = useSupportPlanSummary(projectId);
  const [ticketsPage, setTicketsPage] = useState(1);
  const { data: tickets, isLoading: loadingTickets } = useTicketsList({
    projectId,
    page: ticketsPage,
    pageSize: TICKETS_PAGE_SIZE,
    sortField: 'createdAt',
    sortDirection: 'desc',
  });

  // El contacto del PROYECTO (v1: `proyecto.id_contacto`) puede ser distinto
  // del contacto general del cliente — antes esto siempre mostraba el primer
  // contacto del cliente, ignorando cuál se había asignado a este proyecto.
  const primaryContact = project.primaryContact ?? client?.contacts[0] ?? null;

  const onStatusChange = async (status: ProjectStatus) => {
    await changeStatus.mutateAsync({ projectId, input: { status } });
    toast.success('Se actualizó el estado del proyecto.');
  };

  const ticketColumns: Column<TicketSummary>[] = [
    {
      key: 'code',
      header: 'ID ticket',
      width: '110px',
      render: (t) => (
        <Link to={`/tickets/${t.id}`} className={styles.ticketLink}>
          {t.code ?? '—'}
        </Link>
      ),
    },
    { key: 'title', header: 'Título', render: (t) => t.title },
    { key: 'assignee', header: 'Responsable', render: (t) => t.assignee?.fullName ?? 'Sin asignar' },
    { key: 'estimatedHours', header: 'HH Est.', align: 'right', render: (t) => t.estimatedHours ?? 0 },
    {
      key: 'usedHours',
      header: 'HH Util.',
      align: 'right',
      render: (t) => (
        <span className={t.usedHours > (t.estimatedHours ?? 0) ? styles.overHours : undefined}>{formatHours(t.usedHours)}</span>
      ),
    },
    { key: 'priority', header: 'Criticidad', render: (t) => <TicketPriorityBadge priority={t.priority} /> },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <Card className={styles.contactCard}>
          <p className={detailStyles.sectionTitle}>Contacto Cliente</p>
          {primaryContact ? (
            <div className={styles.contactBody}>
              <div>
                <p className={styles.contactName}>{primaryContact.name}</p>
                <p className={styles.contactPosition}>{primaryContact.position || 'No informado'}</p>
              </div>
              <p className={styles.contactLine}>Tel: {primaryContact.phone || 'No informado'}</p>
              <p className={styles.contactLine}>{primaryContact.email || 'No informado'}</p>
            </div>
          ) : (
            <p className={detailStyles.empty}>Sin contacto registrado.</p>
          )}
        </Card>

        <Card className={styles.dataCard}>
          <p className={detailStyles.sectionTitle}>Datos Proyecto</p>
          <div className={styles.dataRows}>
            <DataRow label="Empresa" value={project.client?.companyName} />
            <DataRow label="Cotización" value={project.quotationLink} link />
            <DataRow label="Contrato" value={project.contractLink} link />
            <DataRow label="Adicionales" value={project.additionalLinks} link />
            <DataRow label="Responsable comercial" value={project.commercialManager?.fullName} />
            <DataRow label="Líder" value={project.leader?.fullName} />
            <DataRow label="Desarrollador" value={project.developer?.fullName} />
            <div className={styles.dateRow}>
              <DataRow label="Inicio" value={formatDate(project.startDate)} />
              <DataRow label="Término" value={formatDate(project.endDate)} />
            </div>
            <p className={styles.supportLine}>
              {project.supportPlanDescription || 'Sin plan'} · {formatHours(project.supportHours)} hrs · Hora extra: UF{' '}
              {formatHours(project.overtimeRateUf)}
            </p>
            {supportSummary && (
              <p className={styles.supportLine}>
                Valor plan: UF {formatHours(supportSummary.planValueUf)} · Hora extra del plan: UF{' '}
                {formatHours(supportSummary.extraHourValueUf)}
              </p>
            )}
          </div>
        </Card>

        <Card className={styles.stateCard}>
          <div className={styles.stateHeader}>
            <p className={detailStyles.sectionTitle}>Estado del proyecto</p>
            {can('projects:manage') ? (
              <Select
                className={styles.stateSelect}
                aria-label="Cambiar estado"
                options={STATUS_OPTIONS}
                value={project.status}
                onChange={(event) => void onStatusChange(event.target.value as ProjectStatus)}
              />
            ) : (
              <span className={styles.stateStatic}>{PROJECT_STATUS_LABELS[project.status]}</span>
            )}
          </div>

          {loadingSummary ? (
            <p className={detailStyles.empty}>Cargando…</p>
          ) : supportSummary ? (
            <SupportHoursDonut summary={supportSummary} />
          ) : (
            <p className={detailStyles.empty}>Sin plan de soporte activo.</p>
          )}
        </Card>
      </div>

      {supportSummary && supportSummary.history.length > 0 && (
        <Card>
          <SupportProgressChart summary={supportSummary} />
        </Card>
      )}

      <Card>
        <p className={detailStyles.sectionTitle}>Tickets del proyecto</p>
        <div style={{ marginTop: 'var(--kora-space-3)' }}>
          <DataTable
            caption="Tickets del proyecto"
            columns={ticketColumns}
            items={tickets?.items ?? []}
            getRowKey={(t) => t.id}
            loading={loadingTickets}
            error={null}
            emptyMessage="Sin tickets registrados."
          />
          {tickets && tickets.total > TICKETS_PAGE_SIZE && (
            <Pagination page={ticketsPage} pageCount={tickets.pageCount} total={tickets.total} pageSize={tickets.pageSize} onPageChange={setTicketsPage} />
          )}
        </div>
      </Card>
    </div>
  );
}

function DataRow({ label, value, link }: { label: string; value?: string | null; link?: boolean }) {
  return (
    <div className={styles.dataRow}>
      <span className={styles.dataLabel}>{label}:</span>
      {value ? (
        link ? (
          <a href={value} target="_blank" rel="noopener noreferrer" className={styles.dataLink}>
            {value}
          </a>
        ) : (
          <span className={styles.dataValue}>{value}</span>
        )
      ) : (
        <span className={styles.dataValue}>—</span>
      )}
    </div>
  );
}
