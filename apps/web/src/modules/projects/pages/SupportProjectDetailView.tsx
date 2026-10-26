import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProjectDetail, ProjectStatus, TicketSummary } from '@kora/contracts';
import { SUPPORT_PLAN_TYPE_LABELS } from '@kora/contracts';
import styles from './SupportProjectDetailView.module.css';
import detailStyles from './ProjectDetailPage.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { Button } from '@/shared/components/ui/Button';
import { PencilIcon } from '@/shared/components/icons/Icons';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { DEFAULT_PAGE_SIZE, Pagination } from '@/shared/components/ui/Pagination';
import { useToast } from '@/shared/components/ui/Toast';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useClientDetail } from '@/modules/clients/api/clients.queries';
import { useChangeProjectStatus } from '../api/projects.queries';
import { useCloseSupportPlan, useSupportPlanSummary, useSupportPlansForClient } from '../api/support-plan.queries';
import { CloseSupportPlanDialog } from '../components/CloseSupportPlanDialog';
import { SUPPORT_STATUS_OPTIONS, supportProjectStatusLabel, supportSubTabForStatus, type SupportSubTab } from '../lib/projects-list-search';
import { useTicketsList } from '@/modules/tickets/api/tickets.queries';
import { TicketPriorityBadge } from '@/modules/tickets/components/TicketPriorityBadge';
import { SupportHoursStatus } from '../components/SupportHoursStatus';
import { SupportProgressChart } from '../components/SupportProgressChart';
import { formatMoney } from '@/shared/lib/format-money';
import { ticketPath } from '@/app/router/paths';
import { ApiRequestError } from '@/shared/lib/api-client';

const formatDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CL') : '—');
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

/**
 * Ficha de proyecto de soporte — réplica de `FichaProyectoSoporte` (v1), que
 * es una pantalla estructuralmente distinta de la de desarrollo
 * (`LiderProyectoFicha`): sin equipo asignado, sin bitácora, sin línea de
 * tiempo. En su lugar: contacto del cliente, datos del contrato, el estado
 * del plan de soporte como anillo, el historial mensual de consumo, y la
 * tabla completa de tickets del proyecto.
 */
export function SupportProjectDetailView({
  project,
  projectId,
  onEdit,
}: {
  project: ProjectDetail;
  projectId: string;
  /** Abre "Editar proyecto" — sin él (quien no puede editar) no se muestra el lápiz. */
  onEdit?: () => void;
}) {
  const { can } = usePermissions();
  const toast = useToast();
  const changeStatus = useChangeProjectStatus();
  const canManageStatus = can('projects:manage');
  const clientId = project.client?.id ?? null;
  const { data: client } = useClientDetail(project.client?.id ?? null);
  const { data: supportSummary, isLoading: loadingSummary } = useSupportPlanSummary(projectId);
  const { data: clientPlans, error: plansError } = useSupportPlansForClient(canManageStatus ? clientId : null);
  const projectPlans = clientPlans?.filter((plan) => plan.projectId === projectId) ?? [];
  const activePlans = projectPlans.filter((plan) => plan.status === 'active');
  const hasClosedPlan = projectPlans.some((plan) => plan.status === 'ended');
  const activePlan = activePlans.length === 1 ? activePlans[0] : null;
  const closePlan = useCloseSupportPlan(activePlan?.id ?? '', clientId ?? undefined);
  const [closing, setClosing] = useState(false);
  const visibleStatus = supportSubTabForStatus(project.status);
  const [ticketsPage, setTicketsPage] = useState(1);
  const [ticketsPageSize, setTicketsPageSize] = useState(DEFAULT_PAGE_SIZE);
  const { data: tickets, isLoading: loadingTickets } = useTicketsList({
    projectId,
    page: ticketsPage,
    pageSize: ticketsPageSize,
    sortField: 'createdAt',
    sortDirection: 'desc',
  });

  // El contacto del PROYECTO (v1: `proyecto.id_contacto`) puede ser distinto
  // del contacto general del cliente — antes esto siempre mostraba el primer
  // contacto del cliente, ignorando cuál se había asignado a este proyecto.
  const primaryContact = project.primaryContact ?? client?.contacts[0] ?? null;

  const onStatusChange = async (next: SupportSubTab) => {
    if (next === visibleStatus) return;
    if (next === 'finished' && activePlan) {
      setClosing(true);
      return;
    }
    if (next === 'finished' && activePlans.length > 1) {
      toast.error('Cierra los contratos activos antes de terminar el proyecto.');
      return;
    }
    if (next === 'finished' && !hasClosedPlan) {
      toast.error('Solo un soporte con contrato cerrado puede marcarse como terminado.');
      return;
    }
    if (next === 'active' && activePlans.length === 0) {
      toast.error('Se necesita un contrato activo para activar este soporte.');
      return;
    }
    const status: ProjectStatus = next === 'inactive' ? 'on_hold' : next;
    try {
      await changeStatus.mutateAsync({ projectId, input: { status } });
      toast.success('Se actualizó el estado del proyecto.');
    } catch (caught) {
      toast.error(caught instanceof ApiRequestError ? caught.message : 'No se pudo actualizar el estado del proyecto.');
    }
  };

  const statusOptions = SUPPORT_STATUS_OPTIONS.map((option) => ({
    ...option,
    disabled:
      (option.value === 'active' && visibleStatus !== 'active' && activePlans.length === 0) ||
      (option.value === 'inactive' && visibleStatus === 'finished' && activePlans.length === 0) ||
      (option.value === 'finished' &&
        visibleStatus !== 'finished' &&
        (activePlans.length > 1 || (activePlans.length === 0 && !hasClosedPlan))),
  }));

  const ticketColumns: Column<TicketSummary>[] = [
    {
      key: 'code',
      header: 'ID ticket',
      width: '110px',
      render: (t) => (
        <Link to={ticketPath(t)} className={styles.ticketLink}>
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
          <div className={detailStyles.cardHeader}>
            <p className={detailStyles.sectionTitle}>Datos Proyecto</p>
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className={detailStyles.editIconButton}
                onClick={onEdit}
                aria-label="Editar proyecto"
                title="Editar proyecto"
              >
                <PencilIcon size={14} />
              </Button>
            )}
          </div>
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
              {supportSummary ? SUPPORT_PLAN_TYPE_LABELS[supportSummary.planType] : 'Sin plan'} · {formatHours(project.soldHours)} hrs · Hora extra:{' '}
              {formatMoney(project.overtimeRateUf, 'UF')}
            </p>
            {supportSummary && (
              <p className={styles.supportLine}>
                Valor plan: {formatMoney(supportSummary.planValueUf, supportSummary.currency)} · Hora extra del plan:{' '}
                {formatMoney(supportSummary.extraHourValueUf, supportSummary.currency)}
              </p>
            )}
          </div>
        </Card>

        <Card className={styles.stateCard}>
          <div className={styles.stateHeader}>
            <p className={detailStyles.sectionTitle}>Estado del proyecto</p>
            {canManageStatus ? (
              <Select
                className={styles.stateSelect}
                aria-label="Cambiar estado"
                options={statusOptions}
                value={visibleStatus}
                disabled={
                  !clientPlans || Boolean(plansError) || changeStatus.isPending || closePlan.isPending || closing ||
                  (visibleStatus === 'finished' && activePlans.length === 0)
                }
                helperText={
                  plansError
                    ? 'No se pudieron cargar los contratos.'
                    : activePlans.length > 1
                      ? 'Cierra los contratos activos para terminar este soporte.'
                      : undefined
                }
                onChange={(event) => void onStatusChange(event.target.value as SupportSubTab)}
              />
            ) : (
              <span className={styles.stateStatic}>{supportProjectStatusLabel(project.status)}</span>
            )}
          </div>

          {loadingSummary ? (
            <p className={detailStyles.empty}>Cargando…</p>
          ) : supportSummary ? (
            <SupportHoursStatus summary={supportSummary} />
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
          {tickets && tickets.total > DEFAULT_PAGE_SIZE && (
            <Pagination
              page={ticketsPage}
              pageCount={tickets.pageCount}
              total={tickets.total}
              pageSize={tickets.pageSize}
              onPageChange={setTicketsPage}
              onPageSizeChange={(size) => {
                setTicketsPageSize(size);
                setTicketsPage(1);
              }}
            />
          )}
        </div>
      </Card>
      <CloseSupportPlanDialog
        open={closing}
        onClose={() => setClosing(false)}
        onConfirm={async (input) => {
          if (!activePlan) throw new Error('Ya no hay un contrato activo para cerrar.');
          await closePlan.mutateAsync(input);
          toast.success('Se cerró el contrato.');
        }}
      />
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
