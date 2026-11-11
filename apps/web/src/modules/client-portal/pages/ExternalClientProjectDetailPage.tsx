import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import styles from './ClientProjectDetailPage.module.css';
import detailStyles from './ExternalClientProjectDetailPage.module.css';
import './ExternalClientProjectPrint.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { useToast } from '@/shared/components/ui/Toast';
import { BuildingIcon, ChevronLeftIcon, ClockIcon, DownloadIcon, LinkIcon } from '@/shared/components/icons/Icons';ns';
import { ProjectProgressOverview } from '../components/ProjectProgressOverview';
import { CommittedDeliveriesRoadmap } from '../components/CommittedDeliveriesRoadmap';
import { PhaseRoadmap } from '../components/PhaseRoadmap';
import { toExternalPhaseRoadmap, externalProjectBitacora, deliveriesGroupedByPhase } from '../adapters/external-project-presentation.adapter';
import { ProjectBillingCard } from '../components/ProjectBillingCard';
import { ProjectBusinessImpact } from '../components/ProjectBusinessImpact';
import { toClientBusinessImpact } from '../adapters/business-impact.adapter';
import { ProjectBitacora } from '../components/ProjectBitacora';
import { StatusPill } from '../components/StatusPill';
import { KabeliLogo } from '@/shared/components/layout/KabeliLogo';
import { clientPortalApi, usePortalProject, usePortalReceive, type PortalProjectDetail } from '../api/client-portal.api';
import type { ClientProjectBilling } from '../types';

const dmy = (value: string | null) => value
  ? new Date(`${value.slice(0,10)}T00:00:00`).toLocaleDateString('es-CL') : '—';
function billingForPortal(project: PortalProjectDetail): ClientProjectBilling {
  const rows = project.paymentMilestones;
  const total = project.contractAmount ?? rows.reduce((n, row) => n + row.amount, 0);
  const sum = (status: string) => rows.filter((m) => m.status === status)
    .reduce((n, row) => n + row.amount, 0);
  const percent = (amount: number) => total > 0 ? Math.round(amount / total * 100) : 0;
  const paid = sum('paid');
  const invoiced = sum('invoiced');
  const pending = total - paid - invoiced;
  return {
    currency: project.contractCurrency,
    totalAmount: total,
    paid: { amount: paid, percent: percent(paid) },
    invoicedPendingCollection: { amount: invoiced, percent: percent(invoiced) },
    pendingToInvoice: { amount: pending, percent: percent(pending) },
    schedule: rows.map((row) => ({
      tramo: row.name, percent: row.percent ?? 0, amount: row.amount,
      invoiceNumber: row.invoiceNumber, issueDate: dmy(row.issuedAt),
      status: row.status === 'paid' ? 'paid' : 'pending',
      paymentDate: row.paidAt ? dmy(row.paidAt) : null,
    })),
  };
}

/**
 * Exclusiva del perfil cliente: no reutiliza /projects/:id ni altera
 * ClientProjectDetailPage (la Vista Cliente interna de PMO).
 */
export function ExternalClientProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const toast = useToast();
  const { data, isLoading, isError } = usePortalProject(projectId ?? null);
  const receive = usePortalReceive(projectId ?? '');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pdfAction, setPdfAction] = useState<'share' | 'download' | null>(null);
  const project = data?.project;
  const shareProjectPdf = async () => {
    if (!projectId || pdfAction) return;
    setPdfAction('share');
    try {
      const { url, expiresAt } = await clientPortalApi.sharePdf(projectId);
      const pdfUrl = new URL(url, window.location.origin).toString();
      await navigator.clipboard.writeText(pdfUrl);
      toast.show(`Enlace de descarga del PDF copiado. Caduca el ${new Date(expiresAt).toLocaleString('es-CL')}. Cualquier persona con el enlace podrá descargarlo.`, 'success');
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'No se pudo generar o copiar el enlace de descarga del PDF.', 'error');
    } finally {
      setPdfAction(null);
    }
  };
  const downloadProjectPdf = async () => {
    if (!projectId || pdfAction) return;
    setPdfAction('download');
    try {
      const blob = await clientPortalApi.pdf(projectId);
      if (blob.type && !blob.type.includes('pdf')) throw new Error('El servidor no entregó un archivo PDF.');
      const name = (project?.name ?? 'proyecto').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = `Kora-${name || 'proyecto'}-seguimiento.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
      }
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'No se pudo descargar el PDF.', 'error');
    } finally {
      setPdfAction(null);
    }
  };
  const receiptIds = useMemo(() => new Set((data?.receipts ?? []).map((r) => r.deliveryId)), [data?.receipts]);
  const pending = useMemo(() => project?.modules.flatMap((phase) =>
    phase.deliveries.filter((delivery) => delivery.status === 'approved' && !receiptIds.has(delivery.id))
      .map((delivery) => ({ ...delivery, phase: phase.name }))) ?? [], [project, receiptIds]);
  const selected = pending.find((delivery) => delivery.id === confirmId);
  const handleReceive = async () => {
    if (!selected) return;
    try {
      await receive.mutateAsync(selected.id);
      setConfirmId(null);
      toast.show('Recepción registrada correctamente.', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No fue posible registrar la recepción.', 'error');
      setConfirmId(null);
    }
  };

  if (isLoading) return <DashboardLayout title="Mis proyectos"><Card>Cargando proyecto…</Card></DashboardLayout>;
  if (isError || !project) return <DashboardLayout title="Mis proyectos">
    <Card role="alert"><p>No tienes acceso a este proyecto o no está disponible.</p>
      <Link to="/portal/proyectos">Volver a proyectos</Link></Card>
  </DashboardLayout>;

  const deliveriesByPhase = deliveriesGroupedByPhase(project, receiptIds);
  const billing = billingForPortal(project);
  const history = externalProjectBitacora(project, data.receipts, data.activity);
  const nativeRoadmap = toExternalPhaseRoadmap(project);
  return (
    <DashboardLayout title="Mis proyectos">
      <div className={styles.page} data-client-portal-print>
        <Link data-client-portal-nav className={styles.breadcrumb} to="/portal/proyectos"><ChevronLeftIcon size={16}/> Volver a mis proyectos</Link>
        <div className={styles.headerBlock}>
          <div className={styles.titleRow}>
            <h2 className={styles.title}>{project.name}</h2>
            <KabeliLogo className={styles.brandLogo}/>
          </div>
        </div>
        <div className={styles.statusActionsRow}>
          <StatusPill tone={project.status === 'active' ? 'success' : 'neutral'}>
            {project.status === 'active' ? 'Activo' : project.status === 'finished' ? 'Finalizado' : 'En seguimiento'}
          </StatusPill>
          <Button variant="outline" iconLeft={<LinkIcon size={15}/>}
            disabled={pdfAction !== null} loading={pdfAction === 'share'}
            onClick={() => void shareProjectPdf()}>
            Compartir PDF
          </Button>
          <Button variant="outline" iconLeft={<DownloadIcon size={15}/>}
            disabled={pdfAction !== null} loading={pdfAction === 'download'}
            onClick={() => void downloadProjectPdf()}>
            Descargar PDF
          </Button>
        </div>
        <p className={styles.lastUpdated}>
          <ClockIcon size={14}/>
          Última actualización: {new Date(project.leaderLastActivityAt ?? project.updatedAt).toLocaleString('es-CL', {
            dateStyle: 'short', timeStyle: 'short',
          })}
        </p>
        <Card className={styles.infoBar}>
          <div className={styles.infoClient}>
            <span className={styles.infoLogoPlaceholder}><BuildingIcon size={20}/></span>
            <div className={styles.infoField}>
              <span className={styles.infoLabel}>Cliente</span>
              <span className={styles.infoValue}>{project.client?.companyName ?? '—'}</span>
            </div>
          </div>
          <div className={styles.infoField}>
            <span className={styles.infoLabel}>Responsable Kabeli</span>
            <span className={styles.infoValue}>{project.commercialManager?.fullName ?? project.leader?.fullName ?? '—'}</span>
          </div>
          <div className={styles.infoField}>
            <span className={styles.infoLabel}>Responsable cliente</span>
            <span className={styles.infoValue}>{project.primaryContact?.name ?? '—'}</span>
            {project.primaryContact?.position && <span className={styles.infoValueSub}>{project.primaryContact.position}</span>}
          </div>
          <div className={styles.infoField}>
            <span className={styles.infoLabel}>Fecha de inicio - fin</span>
            <span className={styles.infoValue}>{dmy(project.startDate)}</span>
            <span className={styles.infoValue}>{dmy(project.endDate)}</span>
          </div>
        </Card>}

</Card>        {pending.length > 0 && (
          <div className={detailStyles.deliveryNotice} role="status">
            <div className={detailStyles.noticeText}>
              <strong>Tienes {pending.length} entrega{pending.length === 1 ? '' : 's'} esperando tu OK.</strong>
              <span className={detailStyles.noticeHint}>Es un respaldo de que la recibiste.</span>
            </div>
            <button type="button" className={detailStyles.noticeButton} onClick={() => {
              requestAnimationFrame(() => document.getElementById('entregas-comprometidas')?.scrollIntoView({ behavior: 'smooth' }));
            }}>Revisar entregas</button>
          </div>
        )}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Facturación</h3>
          <ProjectBillingCard billing={billing}/>
        </section>}

</section>        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Avance del proyecto</h3>
          <ProjectProgressOverview actualPercent={project.progress.actual}
            expectedPercent={project.progress.expected} startDate={dmy(project.startDate)}
            endDate={dmy(project.endDate)}
            daysRemaining={project.endDate ? Math.max(0, Math.ceil(
              (new Date(project.endDate + 'T00:00:00').getTime() - Date.now()) / 86400000)) : 0}/>
        </section>}

</section>        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Horas y avance</h3>
          <div className={styles.hoursGrid}>
            <Card className={styles.statCard}>
              <span className={styles.statLabel}>Horas estimadas</span>
              <span className={[styles.statValue, styles.statValueLarge].join(' ')}>
                {project.soldHours.toLocaleString('es-CL', { maximumFractionDigits: 2 })}
              </span>
              <span className={styles.statSub}>Horas comprometidas</span>
              <div className={styles.hoursDeviationRow}>
                <span className={styles.statLabel}>Horas de exceso</span>
                <div className={styles.hoursDeviationValueRow}>
                  <span className={styles.statSub}>
                    {Math.max(0, project.usedHours - project.soldHours).toLocaleString('es-CL', { maximumFractionDigits: 2 })}
                  </span>
                  <StatusPill tone={project.usedHours > project.soldHours ? 'warning' : 'success'}>
                    {project.usedHours > project.soldHours ? 'En riesgo' : 'Sin exceso'}
                  </StatusPill>
                </div>
              </div>
            </Card>
            <Card className={styles.statCard}>
                <span className={styles.statLabel}>Horas utilizadas a la fecha</span>
                <span className={styles.statValue}>
                  {project.usedHours.toLocaleString('es-CL', { maximumFractionDigits: 2 })}
                </span>
                <span className={styles.statSub}>Actualizado al {dmy(project.usedHoursUpdatedAt)}</span>
              </Card>
            <Card className={styles.statCard}>
              <span className={styles.statLabel}>Avance real vs. esperado</span>
              {project.progress.actual !== null && project.progress.expected !== null ? <>
                <div className={styles.progressValueRow}>
                  <span className={styles.statValue}>{project.progress.actual}%</span>
                  <span className={styles.deviationBadge}>
                    {project.progress.actual - project.progress.expected}%
                  </span>
                </div>
                <span className={styles.statSub}>vs. {project.progress.expected}% esperado</span>
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${Math.min(100, Math.max(0, project.progress.actual))}%` }}/>
                  <div className={styles.progressExpectedMarker} style={{ left: `${Math.min(100, Math.max(0, project.progress.expected))}%` }}/>
                </div>
              </> : <span className={styles.statSub}>Sin plan cargado</span>}
            </Card>
            <Card className={[styles.statCard, styles.statCardDark].join(' ')}>
              <span className={styles.statLabelDark}>Fecha fin del proyecto</span>
              <span className={styles.statValueDark}>{dmy(project.endDate)}</span>
              <span className={styles.statSubDark}>
                {project.endDate ? 'Fecha de entrega planificada' : 'Sin fecha comprometida'}
              </span>
            </Card>
          </div>
        </section>}

</section>        <section className={styles.section} id="entregas-comprometidas">
          <div className={styles.sectionHeadingRow}>
            <h3 className={styles.sectionTitle}>Roadmap por Fases</h3>
            <span className={styles.sectionCaption}>Vista por semana de diseño, desarrollo, QA y aprobación por fase</span>
          </div>
          {/* El Gantt nativo conserva barras y marcadores. Cada fase despliega
              sus propias entregas bajo el gráfico, sin lista global aparte. */}
          <PhaseRoadmap
            phaseRoadmap={nativeRoadmap}
            renderPhaseReferences={(phase) => {
              const phaseDeliveries = deliveriesByPhase.get(phase.id) ?? [];
              return phaseDeliveries.length > 0 ? (
                <CommittedDeliveriesRoadmap
                  deliveries={phaseDeliveries}
                  onReview={setConfirmId}
                  showTimeline={false}
                  embedded
                />
              ) : null;
            }}
          />
        </section>}

</section>        <ProjectBusinessImpact impact={toClientBusinessImpact(project)} />

        {project.qaPlannedTests != null && <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Métricas de la etapa actual</h3>
          <Card>
            <p><strong>Módulo:</strong> {project.qaEvaluatedModule ?? 'General'}</p>
            <p><strong>Pruebas planificadas:</strong> {project.qaPlannedTests}</p>
            <p><strong>Pruebas ejecutadas:</strong> {project.qaExecutedTests ?? 0}</p>
            <p><strong>Pruebas con error:</strong> {project.qaFailedTests ?? 0}</p>
          </Card>
        </section>}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Bitácora</h3>
          <ProjectBitacora entries={history}/>
        </section>}
</section>      </div>
      <Modal open={!!selected} title="Confirmar recepción" onClose={() => setConfirmId(null)}
        dismissible={!receive.isPending}
        description="Este OK es constancia de recepción y quedará registrado en el historial del proyecto."
        footer={<>
          <Button variant="outline" disabled={receive.isPending} onClick={() => setConfirmId(null)}>Cancelar</Button>
          <Button loading={receive.isPending} onClick={() => void handleReceive()}>Confirmar OK</Button>
        </>}>
        <p><strong>Proyecto:</strong> {project.name}</p>
        <p><strong>Fase:</strong> {selected?.phase ?? '—'}</p>
        <p><strong>Entregable:</strong> {selected?.name ?? '—'}</p>
        <p>Esta confirmación no se puede deshacer desde el portal.</p>
      </Modal>
    </DashboardLayout>
  );
}
