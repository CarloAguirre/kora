import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import styles from './ClientSupportContractDetailPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { useToast } from '@/shared/components/ui/Toast';
import { KoraLogo } from '@/shared/components/layout/KoraLogo';
import {
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ClockIcon,
  DownloadIcon,
  LinkIcon,
  PaperclipIcon,
} from '@/shared/components/icons/Icons';
import { useSupportPlanDetail } from '@/modules/projects/api/support-plan.queries';
import { formatMoney } from '@/shared/lib/format-money';
import { useTicketDetail, useTicketsList } from '@/modules/tickets/api/tickets.queries';
import { TicketServiceTypeIcon } from '@/modules/tickets/components/TicketServiceTypeIcon';
import { ticketDescriptionLabel } from '@/modules/tickets/lib/ticket-description-label';
import { StatusPill, type StatusPillTone } from '../components/StatusPill';
import { toSupportContractDetail, toSupportTicketFromDetail } from '../adapters/support-contract.adapter';
import type {
  SupportTicket,
  SupportTicketBillingStatus,
  SupportTicketPriority,
  SupportTicketWorkflowStatus,
} from '../types';

const PLAN_TYPE_LABEL: Readonly<Record<string, string>> = {
  monthly: 'Mensual',
  bundle: 'Bolsa',
  on_demand: 'A demanda',
};

const WORKFLOW_LABEL: Readonly<Record<SupportTicketWorkflowStatus, string>> = {
  pending: 'Pendiente',
  in_progress: 'En Proceso',
  closed: 'Cerrado',
};

const WORKFLOW_TONE: Readonly<Record<SupportTicketWorkflowStatus, StatusPillTone>> = {
  pending: 'neutral',
  in_progress: 'info',
  closed: 'success',
};

const BILLING_LABEL: Readonly<Record<SupportTicketBillingStatus, string>> = {
  to_invoice: 'Por Facturar',
  invoiced: 'Facturada',
  pending_invoice: 'Pendiente facturación',
};

const BILLING_TONE: Readonly<Record<SupportTicketBillingStatus, StatusPillTone>> = {
  to_invoice: 'neutral',
  invoiced: 'success',
  pending_invoice: 'warning',
};

const PRIORITY_LABEL: Readonly<Record<SupportTicketPriority, string>> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

interface StatusFilter {
  readonly key: string;
  readonly label: string;
  readonly matches: (ticket: SupportTicket) => boolean;
}

const STATUS_FILTERS: readonly StatusFilter[] = [
  { key: 'pending', label: 'Pendientes', matches: (t) => t.workflowStatus === 'pending' },
  { key: 'in_progress', label: 'En Proceso', matches: (t) => t.workflowStatus === 'in_progress' },
  { key: 'closed', label: 'Cerrado', matches: (t) => t.workflowStatus === 'closed' },
  { key: 'invoiced', label: 'Facturados', matches: (t) => t.billingStatus === 'invoiced' },
  { key: 'pending_invoice', label: 'Pendientes facturación', matches: (t) => t.billingStatus === 'pending_invoice' },
];

const formatHours = (value: number) => `${value.toLocaleString('es-CL', { maximumFractionDigits: 1 })}h`;

export interface ClientSupportContractDetailPageProps {
  readonly contractIdOverride?: string;
  readonly backTo?: string;
  readonly backLabel?: string;
  /** Título del header — siempre el de la sección del menú: "Soporte" en el
   *  portal real, "Clientes" en la vista previa de admin. */
  readonly title?: string;
}

/**
 * Ficha de contrato de soporte ("Detalle contrato de soporte", Figma node
 * 9007:8445) — completa la pieza que `docs/DECISION-PORTAL-CLIENTE.md` dejó
 * pendiente: el nombre del contrato en la tabla de Soporte era texto plano,
 * no un enlace a esta pantalla con la lista de tickets del contrato.
 *
 * Datos reales vía `useSupportPlanDetail(contractId)` + `useTicketsList({clientId})`
 * (ver `adapters/support-contract.adapter.ts`). Soporta ambos tipos de contrato
 * (Figma node 9007:8170 consolidado / 9007:8445 único) según `plan.scope`.
 * `contractIdOverride`/`backTo`/`backLabel` son para la vista previa de admin
 * desde `ClientDetailPage` (ver `modules/clients/pages/ClientSupportContractPreviewPage.tsx`).
 */
export function ClientSupportContractDetailPage({
  contractIdOverride,
  backTo,
  backLabel,
  title = 'Soporte',
}: ClientSupportContractDetailPageProps = {}) {
  const { contractId: routeContractId } = useParams<{ contractId: string }>();
  const contractId = contractIdOverride ?? routeContractId ?? null;
  const navigate = useNavigate();
  const toast = useToast();
  const { data: plan, isLoading: planLoading, isError: planError } = useSupportPlanDetail(contractId);
  const resolvedBackTo = backTo ?? '/portal/soporte';

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<ReadonlySet<string>>(
    () => new Set(STATUS_FILTERS.filter((f) => f.key !== 'pending').map((f) => f.key)),
  );
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(true);

  const currentProjectId = activeProjectId ?? plan?.linkedProjects[0]?.id ?? null;

  const { data: ticketsPage } = useTicketsList({
    clientId: plan?.clientId ? [plan.clientId] : undefined,
    pageSize: 200,
    sortField: 'createdAt',
    sortDirection: 'desc',
  });
  const ticketsForActiveProject = useMemo(
    () => (ticketsPage?.items ?? []).filter((t) => t.developmentProject?.id === currentProjectId),
    [ticketsPage, currentProjectId],
  );
  const contract = plan ? toSupportContractDetail(plan, ticketsForActiveProject) : undefined;

  const notifyMock = (label: string) => toast.show(`"${label}" es una acción de ejemplo — todavía no está conectada.`, 'info');

  const toggleFilter = (key: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredTickets = useMemo(() => {
    if (!contract) return [];
    return contract.tickets.filter((ticket) =>
      STATUS_FILTERS.some((filter) => activeFilters.has(filter.key) && filter.matches(ticket)),
    );
  }, [contract, activeFilters]);

  const selectedRow = filteredTickets.find((t) => t.id === selectedTicketId) ?? filteredTickets[0] ?? null;
  const { data: ticketDetail } = useTicketDetail(selectedRow?.id ?? null);
  const selectedTicket =
    selectedRow && ticketDetail && ticketDetail.id === selectedRow.id ? toSupportTicketFromDetail(ticketDetail) : selectedRow;

  const rangeStats = useMemo(() => {
    const used = filteredTickets.reduce((sum, t) => sum + t.usedHours, 0);
    const totalValue = contract ? used * contract.currentHourValueUf : 0;
    return { count: filteredTickets.length, used, totalValue };
  }, [filteredTickets, contract]);

  if (planLoading) {
    return (
      <DashboardLayout title={title}>
        <div className={styles.page}>
          <Card className={styles.notFoundCard}>
            <p>Cargando contrato de soporte…</p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (!contract || planError) {
    return (
      <DashboardLayout title={title}>
        <div className={styles.page}>
          <Card className={styles.notFoundCard}>
            <p>No se pudo cargar este contrato.</p>
            <p className={styles.notFoundHint}>Verifica que el enlace apunte a un contrato existente.</p>
            <Button variant="outline" iconLeft={<ChevronLeftIcon size={16} />} onClick={() => navigate(resolvedBackTo)}>
              {backLabel ?? 'Volver a soporte'}
            </Button>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={title}>
      <div className={styles.page}>
        <Link className={styles.breadcrumb} to={resolvedBackTo}>
          <ChevronLeftIcon size={16} /> {backLabel ?? `Volver a vista cliente ${contract.company.name}`}
        </Link>

        <div className={styles.headerRow}>
          <div className={styles.titleGroup}>
            <h2 className={styles.title}>{contract.name}</h2>
            <StatusPill tone={contract.status === 'active' ? 'success' : 'neutral'}>
              {contract.status === 'active' ? 'Vigente' : 'Finalizado'}
            </StatusPill>
          </div>
          <div className={styles.actionsGroup}>
            <Button variant="outline" iconLeft={<LinkIcon size={15} />} onClick={() => notifyMock('Compartir PDF')}>
              Compartir PDF
            </Button>
            <Button variant="outline" iconLeft={<DownloadIcon size={15} />} onClick={() => notifyMock('Descargar PDF')}>
              Descargar PDF
            </Button>
            <KoraLogo variant="dark" />
          </div>
        </div>

        <Card>
          {contract.scope === 'single' && contract.description && (
            <p className={styles.sectionTitle} style={{ marginBottom: 'var(--kora-space-4)' }}>
              {contract.description}
            </p>
          )}

          {contract.scope === 'consolidated' && (
            <div className={styles.consolidatedSection}>
              <h3 className={styles.sectionTitle}>Proyectos del consolidado</h3>
              <div className={styles.consolidatedTabs} role="tablist" aria-label="Proyectos del consolidado">
                {contract.linkedProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    role="tab"
                    aria-selected={project.id === currentProjectId}
                    className={[
                      styles.consolidatedTab,
                      project.id === currentProjectId ? styles.consolidatedTabActive : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      setActiveProjectId(project.id);
                      setSelectedTicketId(null);
                    }}
                  >
                    {project.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.infoBar}>
            <InfoField label="Tipo de contrato" value={PLAN_TYPE_LABEL[contract.planType] ?? contract.planType} />
            <InfoField label="Responsable Kabeli" value={contract.kabeliOwnerName} />
            <InfoField label="Fecha de inicio" value={contract.startDate} />
            <InfoField label="Fecha de término" value={contract.endDate} />
            <InfoField label="HH contratadas" value={contract.contractedHours} />
            <InfoField label="HH consumidas" value={contract.consumedHours} />
            <InfoField label="Valor HH actual" value={formatMoney(contract.currentHourValueUf, contract.currency)} />
            <InfoField label="Valor HH extra" value={formatMoney(contract.extraHourValueUf, contract.currency)} />
          </div>
        </Card>

        <section className={styles.section}>
          <div className={styles.ticketsHeadingRow}>
            <div>
              <h3 className={styles.sectionTitle}>Tickets del proyecto</h3>
              <div className={styles.ticketsStatsRow}>
                <span>
                  Tickets del rango: <strong>{rangeStats.count}</strong>
                </span>
                <span>
                  HH utilizadas: <strong>{formatHours(rangeStats.used)}</strong>
                </span>
                <span>
                  Total Valor: <strong>{formatMoney(rangeStats.totalValue, contract.currency)}</strong>
                </span>
              </div>
            </div>
            <button
              type="button"
              className={styles.dateRangeButton}
              onClick={() => notifyMock('Cambiar rango de fechas')}
            >
              <CalendarIcon size={15} />
              {contract.rangeStartDate} al {contract.rangeEndDate}
            </button>
          </div>

          <div className={styles.filterRow} role="group" aria-label="Filtrar tickets por estado">
            {STATUS_FILTERS.map((filter) => {
              const active = activeFilters.has(filter.key);
              return (
                <button
                  key={filter.key}
                  type="button"
                  className={[styles.filterChip, active ? styles.filterChipActive : ''].filter(Boolean).join(' ')}
                  aria-pressed={active}
                  onClick={() => toggleFilter(filter.key)}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          <div className={styles.ticketsLayout}>
            <div className={styles.ticketList}>
              {filteredTickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  className={[
                    styles.ticketListItem,
                    ticket.id === selectedTicket?.id ? styles.ticketListItemActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setSelectedTicketId(ticket.id)}
                >
                  <div className={styles.ticketListItemMain}>
                    <span className={styles.ticketCode}>
                      <TicketServiceTypeIcon serviceType={ticket.type} size={13} />
                      {ticket.code}
                    </span>
                    <span className={styles.ticketListTitle}>{ticket.title}</span>
                  </div>
                  <div className={styles.ticketListPills}>
                    <StatusPill tone={BILLING_TONE[ticket.billingStatus]}>{BILLING_LABEL[ticket.billingStatus]}</StatusPill>
                    <StatusPill tone={WORKFLOW_TONE[ticket.workflowStatus]}>{WORKFLOW_LABEL[ticket.workflowStatus]}</StatusPill>
                  </div>
                </button>
              ))}

              <div className={styles.ticketListFooter}>
                <span>
                  Tickets del rango: <strong>{rangeStats.count}</strong>
                </span>
                <span>
                  HH utilizadas: <strong>{formatHours(rangeStats.used)}</strong>
                </span>
                <span>
                  Total Valor: <strong>{formatMoney(rangeStats.totalValue, contract.currency)}</strong>
                </span>
              </div>
            </div>

            <div className={styles.ticketDetail}>
              {!selectedTicket ? (
                <p className={styles.ticketDetailEmpty}>Selecciona un ticket de la lista para ver su detalle.</p>
              ) : (
                <>
                  <div className={styles.ticketDetailHeadRow}>
                    <span className={styles.ticketDetailHeading}>
                      <TicketServiceTypeIcon serviceType={selectedTicket.type} size={15} />
                      <span>{selectedTicket.code}</span> {selectedTicket.title}
                    </span>
                    <StatusPill tone={WORKFLOW_TONE[selectedTicket.workflowStatus]}>
                      {WORKFLOW_LABEL[selectedTicket.workflowStatus]}
                    </StatusPill>
                  </div>

                  <p className={styles.ticketMetaItem}>
                    Responsable: <strong>{selectedTicket.responsibleName}</strong>
                  </p>

                  <div className={styles.ticketMetaGrid}>
                    <span className={styles.ticketMetaItem}>
                      <CalendarIcon size={14} /> Reporte: <strong>{selectedTicket.reportDate}</strong>
                    </span>
                    <span className={styles.ticketMetaItem}>
                      <ClockIcon size={14} /> Estimadas: <strong>{selectedTicket.estimatedHours}hrs</strong>
                    </span>
                    <span className={styles.ticketMetaItem}>
                      Prioridad:{' '}
                      <span className={[styles.priorityPill, styles[`priority_${selectedTicket.priority}`]].join(' ')}>
                        {PRIORITY_LABEL[selectedTicket.priority]}
                      </span>
                    </span>
                  </div>

                  <div className={styles.ticketMetaGrid}>
                    <span className={styles.ticketMetaItem}>
                      <CalendarIcon size={14} /> Solución: <strong>{selectedTicket.solutionDate ?? '—'}</strong>
                    </span>
                    <span className={styles.ticketMetaItem}>
                      <ClockIcon size={14} /> Utilizadas: <strong>{selectedTicket.usedHours}hrs</strong>
                    </span>
                  </div>

                  <div className={styles.ticketMetaGrid}>
                    <span className={styles.ticketMetaItem}>
                      SLA: <span className={styles.slaValue}>{selectedTicket.sla}</span>
                    </span>
                    <StatusPill tone={BILLING_TONE[selectedTicket.billingStatus]}>
                      {BILLING_LABEL[selectedTicket.billingStatus]}
                    </StatusPill>
                  </div>

                  <div className={styles.ticketDetailBlock}>
                    <span className={styles.ticketDetailBlockLabel}>{ticketDescriptionLabel(selectedTicket.type)}:</span>
                    <p className={styles.ticketDetailBlockText}>{selectedTicket.description}</p>
                  </div>

                  <div className={styles.ticketDetailBlock}>
                    <span className={styles.ticketDetailBlockLabel}>Documentos de evidencia:</span>
                    {selectedTicket.evidenceFiles.length === 0 ? (
                      <p className={styles.ticketDetailBlockText}>Sin documentos adjuntos.</p>
                    ) : (
                      <div className={styles.evidenceList}>
                        {selectedTicket.evidenceFiles.map((file) => (
                          <button
                            key={file}
                            type="button"
                            className={styles.evidenceLink}
                            onClick={() => notifyMock(`Ver ${file}`)}
                          >
                            <PaperclipIcon size={13} /> {file}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={styles.ticketDetailBlock}>
                    <span className={styles.ticketDetailBlockLabel}>Solución Aplicada</span>
                    <p className={styles.ticketDetailBlockText}>{selectedTicket.appliedSolution ?? '-'}</p>
                  </div>

                  <div className={styles.historyBox}>
                    <button
                      type="button"
                      className={styles.historyToggle}
                      aria-expanded={historyOpen}
                      onClick={() => setHistoryOpen((v) => !v)}
                    >
                      Historial de ticket:
                      <ChevronDownIcon size={16} style={{ transform: historyOpen ? 'rotate(180deg)' : undefined }} />
                    </button>
                    {historyOpen &&
                      selectedTicket.history.map((entry, i) => (
                        <div key={i} className={styles.historyEntry}>
                          <span className={styles.historyDate}>
                            <CalendarIcon size={13} /> {entry.date}
                          </span>
                          <div className={styles.historyBody}>
                            <span>{entry.label}</span>
                            {entry.details && (
                              <ul className={styles.historyDetails}>
                                {entry.details.map((detail) => (
                                  <li key={detail}>{detail}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}

function InfoField({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.infoField}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>{value}</span>
    </div>
  );
}
