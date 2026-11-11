import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import styles from './ClientProjectDetailPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { useToast } from '@/shared/components/ui/Toast';
import { useStoredState } from '@/shared/hooks/useStoredState';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import {
  BarChartIcon, CalendarIcon, ChevronLeftIcon, CircleCheckIcon, ClockIcon,
  DollarSignIcon, DownloadIcon, EyeIcon, HistoryIcon, LinkIcon, ListIcon,
  TrendingUpIcon,
} from '@/shared/components/icons/Icons';
import { ProjectProgressOverview } from '../components/ProjectProgressOverview';
import { PhaseRoadmap } from '../components/PhaseRoadmap';
import { ProjectBillingCard } from '../components/ProjectBillingCard';
import { ProjectBitacora } from '../components/ProjectBitacora';
import { StatusPill } from '../components/StatusPill';
import { KabeliLogo } from '@/shared/components/layout/KabeliLogo';
import { roleFromTeamName } from '../adapters/project-detail.adapter';
import { usePortalProject, usePortalReceive, type PortalProjectDetail, type PortalReceipt } from '../api/client-portal.api';
import type { ClientBitacoraEntry, ClientProjectBilling, ProjectPhaseRoadmap, PhaseRoadmapTaskScope } from '../types';

const dmy = (value: string | null) => value
  ? new Date(`${value.slice(0,10)}T00:00:00`).toLocaleDateString('es-CL') : '—';
const localTime = (iso: string) => new Date(iso).toLocaleString('es-CL', {
  dateStyle: 'short', timeStyle: 'short',
});

const scopeForTeam = (name: string | null): PhaseRoadmapTaskScope => {
  const role = roleFromTeamName(name);
  return role === 'qa' ? 'qa' : role === 'ux' ? 'diseno' : 'desarrollo';
};

/** Proyección para el Roadmap Kora, sin pedir módulos/tareas internos al navegador. */
function roadmapForPortal(project: PortalProjectDetail): ProjectPhaseRoadmap {
  const dates = project.modules.flatMap((phase) => [
    ...phase.segments.flatMap((segment) => [segment.startDate, segment.endDate]),
    ...phase.tasks.map((task) => task.date),
    ...phase.deliveries.map((delivery) => delivery.estimatedDate),
  ]).filter(Boolean).sort();
  const today = new Date().toISOString().slice(0, 10);
  const shift = (iso: string, days: number) => {
    const date = new Date(`${iso}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  return {
    phaseCount: project.modules.length,
    teamSegmentCount: project.modules.reduce((sum, phase) => sum + phase.segments.length, 0),
    plannedDeliveryCount: project.modules.reduce((sum, phase) => sum + phase.deliveries.length, 0),
    // Evita rango de longitud cero cuando todavía no hay tareas/entregas.
    rangeStartDate: shift(dates[0] ?? project.startDate ?? today, -7),
    rangeEndDate: shift(dates.at(-1) ?? project.endDate ?? today, 7),
    phases: project.modules.map((phase, index) => ({
      id: phase.id,
      badge: `FASE ${index + 1}`,
      name: phase.name,
      status: phase.currentStage === 'closed' ? 'finished'
        : phase.tasks.some((t) => (t.startDate ?? t.date) <= today) ? 'in_progress' : 'upcoming',
      alertLabel: phase.blockerCount > 0 ? `${phase.blockerCount} incidente(s)` : null,
      tasks: phase.segments.map((segment) => ({
        id: segment.id,
        role: roleFromTeamName(segment.teamName),
        scope: scopeForTeam(segment.teamName),
        label: segment.name,
        startDate: segment.startDate,
        endDate: segment.endDate,
      })),
      deliveries: phase.deliveries.map((delivery) => ({
        id: delivery.id,
        label: delivery.name ?? (delivery.teamName ? `Entrega ${delivery.teamName}` : 'Entrega'),
        date: delivery.estimatedDate,
        state: delivery.status === 'approved' ? 'delivered'
          : delivery.estimatedDate < today ? 'delayed' : 'committed',
      })),
      taskItems: phase.tasks.map((task) => ({
        id: task.id,
        label: task.name,
        date: task.date,
        state: task.status === 'done' ? 'done' : task.date < today ? 'delayed' : 'upcoming',
        scope: task.scope,
      })),
      scopeProgress: phase.progress.scopes as Record<PhaseRoadmapTaskScope, number | null>,
      relatedBitacora: [],
    })),
  };
}

function billingForPortal(project: PortalProjectDetail): ClientProjectBilling {
  const rows = project.paymentMilestones;
  const total = rows.reduce((n, row) => n + row.amount, 0);
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

function receivedEvents(project: PortalProjectDetail, receipts: PortalReceipt[]): ClientBitacoraEntry[] {
  const deliveryMap = new Map(project.modules.flatMap((phase, index) =>
    phase.deliveries.map((delivery) => [delivery.id, { name: delivery.name, phase: `FASE ${index + 1} - ${phase.name}` }] as const)));
  return receipts.map((receipt) => {
    const delivery = deliveryMap.get(receipt.deliveryId);
    return {
      id: receipt.deliveryId, kind: 'completed' as const,
      title: `Recepción de entregable: ${delivery?.name ?? 'Entrega'}`,
      registeredByName: receipt.receivedByName,
      registeredAt: localTime(receipt.receivedAt),
      phaseTag: delivery?.phase ?? null,
      description: 'El contacto del cliente confirmó la recepción del entregable.',
      secondaryNote: `✓ Recepción confirmada por ${receipt.receivedByName} el ${localTime(receipt.receivedAt)}`,
      statusLabel: 'Recibida', statusTone: 'success' as const,
      isIncident: false, isDeliveryOrTask: true,
      filterDate: receipt.receivedAt.slice(0, 10),
    };
  }).sort((a,b) => b.filterDate.localeCompare(a.filterDate));
}

/** Misma botonera del diseño y de la Vista Cliente interna. Cada icono controla
 * una sección de la ficha, no la autorización ni los datos del proyecto. */
type SectionKey = 'info' | 'billing' | 'links' | 'progress' | 'hours' | 'gantt' | 'impact' | 'qa' | 'bitacora';
const SECTION_TOGGLES: ReadonlyArray<{ key: SectionKey; label: string; icon: typeof LinkIcon }> = [
  { key: 'info', label: 'Datos del proyecto', icon: ListIcon },
  { key: 'billing', label: 'Facturación', icon: DollarSignIcon },
  { key: 'links', label: 'Accesos y enlaces', icon: LinkIcon },
  { key: 'progress', label: 'Avance del proyecto', icon: CircleCheckIcon },
  { key: 'hours', label: 'Horas y avance', icon: ClockIcon },
  { key: 'gantt', label: 'Roadmap por fases', icon: CalendarIcon },
  { key: 'impact', label: 'Impacto en el negocio', icon: TrendingUpIcon },
  { key: 'qa', label: 'Métricas QA', icon: BarChartIcon },
  { key: 'bitacora', label: 'Bitácora', icon: HistoryIcon },
];
const DEFAULT_PREFS: {
  sections: Partial<Record<SectionKey, boolean>>;
  usedHoursVisible: boolean;
} = { sections: {}, usedHoursVisible: true };

/**
 * Exclusiva del perfil cliente: no reutiliza /projects/:id ni altera
 * ClientProjectDetailPage (la Vista Cliente interna de PMO).
 */
export function ExternalClientProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const toast = useToast();
  const { user } = useAuth();
  const { data, isLoading, isError } = usePortalProject(projectId ?? null);
  const receive = usePortalReceive(projectId ?? '');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const project = data?.project;
  const prefsKey = user?.id && project?.client?.id
    ? `kora:external-portal-ficha:${user.id}:${project.client.id}` : null;
  const [prefs, setPrefs] = useStoredState(prefsKey, DEFAULT_PREFS);
  const visible = (key: SectionKey) => prefs.sections[key] !== false;
  const toggleSection = (key: SectionKey) =>
    setPrefs((prev) => ({
      ...prev, sections: { ...prev.sections, [key]: prev.sections[key] === false },
    }));
  const usedHoursVisible = prefs.usedHoursVisible !== false;
  const toggleUsedHours = () =>
    setPrefs((prev) => ({ ...prev, usedHoursVisible: prev.usedHoursVisible === false }));
  const shareProjectLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.show('Enlace a la ficha copiado. El destinatario necesita acceso al proyecto.', 'success');
    } catch {
      toast.show('No se pudo copiar el enlace de la ficha.', 'error');
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

  if (isLoading) return <DashboardLayout title="Proyectos"><Card>Cargando proyecto…</Card></DashboardLayout>;
  if (isError || !project) return <DashboardLayout title="Proyectos">
    <Card role="alert"><p>No tienes acceso a este proyecto o no está disponible.</p>
      <Link to="/portal/proyectos">Volver a proyectos</Link></Card>
  </DashboardLayout>;

  const roadmap = roadmapForPortal(project);
  const billing = billingForPortal(project);
  const history = receivedEvents(project, data.receipts);
  const hoursDeviation = Math.max(0, project.usedHours - project.soldHours);
  const accessLinks = [
    { label: 'Demostración', href: project.demoLink },
    { label: 'Ambiente de pruebas', href: project.testEnvironmentLink },
    { label: 'Diseño en Figma', href: project.figmaLink },
    { label: 'Documentación', href: project.documentationLink },
  ].filter((link): link is { label: string; href: string } =>
    !!link.href && /^https?:\/\//i.test(link.href));
  return (
    <DashboardLayout title="Proyectos">
      <div className={styles.page}>
        <Link className={styles.breadcrumb} to="/portal/proyectos"><ChevronLeftIcon size={16}/> Volver a mis proyectos</Link>
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
          <Button variant="outline" iconLeft={<LinkIcon size={15}/>} onClick={() => void shareProjectLink()}>
            Compartir PDF
          </Button>
          <Button variant="outline" iconLeft={<DownloadIcon size={15}/>} onClick={() => window.print()}>
            Descargar PDF
          </Button>
        </div>
        <p className={styles.lastUpdated}>
          <ClockIcon size={14}/>
          Última actualización: {new Date(project.updatedAt).toLocaleString('es-CL', {
            dateStyle: 'short', timeStyle: 'short',
          })}
        </p>
        <div className={styles.sectionToggles} role="group" aria-label="Mostrar u ocultar secciones">
          {SECTION_TOGGLES.map(({ key, label, icon: Icon }) => {
            const available = key === 'links' ? accessLinks.length > 0
              : key === 'impact' ? project.impactBeforeHours != null || project.impactAfterHours != null
              : key === 'qa' ? project.qaPlannedTests != null : true;
            return (
              <button key={key} type="button" disabled={!available}
                className={[styles.sectionToggle, visible(key) && available ? styles.sectionToggleOn : ''].filter(Boolean).join(' ')}
                aria-label={available ? `${visible(key) ? 'Ocultar' : 'Mostrar'} ${label}` : `${label} (sin datos disponibles)`}
                aria-pressed={available && visible(key)}
                data-tooltip={available ? label : `${label} (sin datos)`}
                onClick={() => toggleSection(key)}>
                <Icon size={16}/>
              </button>
            );
          })}
          <button type="button" className={[styles.sectionToggle, usedHoursVisible ? styles.sectionToggleOn : ''].filter(Boolean).join(' ')}
            aria-pressed={usedHoursVisible}
            aria-label={usedHoursVisible ? 'Ocultar horas consumidas' : 'Mostrar horas consumidas'}
            data-tooltip={usedHoursVisible ? 'Ocultar horas consumidas' : 'Mostrar horas consumidas'}
            onClick={toggleUsedHours}>
            <EyeIcon size={16}/>
          </button>
        </div>
        {pending.length > 0 && (
          <Card>
            <h3>Tienes {pending.length} entrega{pending.length !== 1 ? 's' : ''} esperando tu OK</h3>
            <p>El OK deja constancia de recepción; no sustituye la aprobación técnica interna.</p>
            {pending.map((delivery) => (
              <div key={delivery.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: 12, padding: '10px 0', borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>
                <div><strong>{delivery.name ?? 'Entregable'}</strong>
                  <div>{delivery.phase} · Entregado para revisión · {dmy(delivery.estimatedDate)}</div>
                </div>
                <Button size="sm" onClick={() => setConfirmId(delivery.id)} iconLeft={<CircleCheckIcon size={15}/>}>
                  Dar OK
                </Button>
              </div>
            ))}
          </Card>
        )}
        {visible('info') && <Card className={styles.infoBar}>
          <div><strong>Cliente</strong><p>{project.client?.companyName ?? '—'}</p></div>
          <div><strong>Responsable Kabeli</strong><p>{project.commercialManager?.fullName ?? project.leader?.fullName ?? '—'}</p></div>
          <div><strong>Contacto cliente</strong><p>{project.primaryContact?.name ?? '—'}</p></div>
          <div><strong>Inicio – Fin</strong><p>{dmy(project.startDate)} – {dmy(project.endDate)}</p></div>
        </Card>}
        {visible('progress') && <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Avance del proyecto</h3>
          <ProjectProgressOverview actualPercent={project.progress.actual}
            expectedPercent={project.progress.expected} startDate={dmy(project.startDate)}
            endDate={dmy(project.endDate)}
            daysRemaining={project.endDate ? Math.max(0, Math.ceil(
              (new Date(`${project.endDate}T00:00:00`).getTime() - Date.now()) / 86400000)) : 0}/>
        </section>}
        {visible('hours') && <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Horas y avance</h3>
          <Card>
            <p><strong>HH estimadas:</strong> {project.soldHours.toLocaleString('es-CL')}</p>
            {usedHoursVisible && <p><strong>HH utilizadas:</strong> {project.usedHours.toLocaleString('es-CL')}</p>}
            {usedHoursVisible && <p><strong>Desviación:</strong> {hoursDeviation.toLocaleString('es-CL')} HH</p>}
          </Card>
        </section>}
        {visible('billing') && <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Facturación</h3>
          <ProjectBillingCard billing={billing}/>
        </section>}
        {visible('links') && accessLinks.length > 0 && <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Accesos y enlaces</h3>
          <Card><div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {accessLinks.map((link) => <a key={link.label} href={link.href}
              target="_blank" rel="noopener noreferrer">{link.label}</a>)}
          </div></Card>
        </section>}
        {visible('impact') && (project.impactBeforeHours != null || project.impactAfterHours != null) && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Impacto en el negocio</h3>
            <Card>
              <p><strong>Antes:</strong> {project.impactBeforeHours ?? '—'} horas por proceso</p>
              <p><strong>Después:</strong> {project.impactAfterHours ?? '—'} horas por proceso</p>
            </Card>
          </section>
        )}
        {visible('qa') && project.qaPlannedTests != null && <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Métricas QA</h3>
          <Card>
            <p><strong>Módulo:</strong> {project.qaEvaluatedModule ?? 'General'}</p>
            <p><strong>Pruebas planificadas:</strong> {project.qaPlannedTests}</p>
            <p><strong>Pruebas ejecutadas:</strong> {project.qaExecutedTests ?? 0}</p>
            <p><strong>Pruebas con error:</strong> {project.qaFailedTests ?? 0}</p>
          </Card>
        </section>}
        {visible('gantt') && <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Roadmap por fases</h3>
          <PhaseRoadmap phaseRoadmap={roadmap}/>
        </section>}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Recepción de entregables</h3>
          {project.modules.flatMap((phase) => phase.deliveries.map((delivery) => (
            <Card key={delivery.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <span>{phase.name} · {delivery.name ?? 'Entrega'} ({dmy(delivery.estimatedDate)})</span>
                <StatusPill tone={receiptIds.has(delivery.id) ? 'success' : 'neutral'}>
                  {receiptIds.has(delivery.id) ? 'OK recibido' : delivery.status === 'approved' ? 'Esperando tu OK' : 'Programada'}
                </StatusPill>
              </div>
            </Card>
          )))}
        </section>
        {visible('bitacora') && <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Bitácora de recepciones</h3>
          <ProjectBitacora entries={history}/>
        </section>}
      </div>
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
