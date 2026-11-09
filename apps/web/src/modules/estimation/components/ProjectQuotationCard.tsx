import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isQuotationDraftEligibleProject, type ProjectDetail, type QuotationVersion } from '@kora/contracts';
import { projectQuotationPath } from '@/app/router/paths';
import { useAppliedQuotationPlanning, useDeleteQuotationVersion, useProjectQuotation, useQuotationLifecycle } from '../api/quotation.queries';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { useConfirmAction } from '@/shared/components/ui/useConfirmAction';
import { NewProjectQuotationModal } from './NewProjectQuotationModal';
import { quotationCommercialBlockers } from './quotation-commercial-blockers';
import { QuotationApprovalDialog, QuotationTransferDialog } from './QuotationLifecycleDialogs';
import styles from './ProjectQuotationCard.module.css';

export function ProjectQuotationCard({ project }: { project: ProjectDetail }) {
  const { data, isLoading, error } = useProjectQuotation(project.id);
  const applied = useAppliedQuotationPlanning(project.id);
  const lifecycle = useQuotationLifecycle(project.id);
  const deleteVersion = useDeleteQuotationVersion(project.id);
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [approving, setApproving] = useState<QuotationVersion | null>(null);
  const [transferring, setTransferring] = useState<QuotationVersion | null>(null);
  const [transferTiming, setTransferTiming] = useState<'now' | 'later'>(
    project.status === 'draft' ? 'now' : 'later',
  );
  const [transferFromApproval, setTransferFromApproval] = useState(false);
  const [transferRevision, setTransferRevision] = useState<number | null>(null);
  const { confirm, dialog: confirmationDialog } = useConfirmAction();
  const versions = [...(data?.versions ?? [])].sort((a, b) => b.versionNumber - a.versionNumber);
  // El traspaso cierra todas las versiones del proyecto, incluso las no seleccionadas.
  const closed = Boolean(data?.transferredVersionId);
  const eligible = isQuotationDraftEligibleProject(project) && !closed;
  const transferredVersion = versions.find((version) => version.id === data?.transferredVersionId);
  const registerApproval = (version: QuotationVersion) => {
    // Prevalidación compartida con la calculadora; el backend vuelve a validar.
    if (quotationCommercialBlockers(version, {
      dirty: false, canOperate: eligible, demoProduction: import.meta.env.PROD,
    }).length > 0) return;
    setActionError(''); setActionNotice('');
    setTransferTiming(project.status === 'draft' ? 'now' : 'later');
    setApproving(version);
  };

  const confirmApproval = async () => {
    if (!approving) return;
    setActionError(''); setActionNotice('');
    try {
      const approved = await lifecycle.approveClient.mutateAsync({
        versionId: approving.id, revision: approving.revision,
        ...(approving.status === 'draft' ? { confirmWithoutSend: true as const } : {}),
      });
      setApproving(null);
      if (transferTiming === 'now' && (project.status === 'draft' || project.status === 'active')) {
        setTransferring(approving);
        setTransferRevision(approved.revision);
        setTransferFromApproval(true);
      } else {
        setActionNotice('Aprobación registrada · traspaso pendiente.');
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'No fue posible registrar la aprobación.');
    }
  };

  const removeVersion = async (versionId: string, revision: number,
    versionNumber: number, name: string) => {
    setActionError(''); setActionNotice('');
    if (!await confirm({ title: 'Eliminar cotización v' + versionNumber, description: '¿Eliminar definitivamente la cotización «' + name + '»? Esta acción no se puede deshacer. No se modificarán otras versiones ni la planificación del proyecto.', confirmLabel: 'Eliminar cotización', destructive: true })) return;
    try {
      await deleteVersion.mutateAsync({ versionId, revision });
      setActionNotice('Cotización v' + versionNumber + ' eliminada.');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'No fue posible eliminar la cotización.');
    }
  };
  const transferNow = (version: QuotationVersion) => {
    setActionError(''); setActionNotice('');
    setTransferFromApproval(false);
    setTransferRevision(null);
    setTransferring(version);
  };

  const closeTransfer = () => {
    if (transferFromApproval) setActionNotice('Aprobación registrada · traspaso pendiente.');
    setTransferring(null);
    setTransferFromApproval(false);
    setTransferRevision(null);
  };

  const confirmTransfer = async () => {
    if (!transferring) return;
    setActionError(''); setActionNotice('');
    try {
      await lifecycle.transferApproved.mutateAsync({
        versionId: transferring.id, revision: transferRevision ?? transferring.revision,
      });
      setTransferring(null);
      setTransferRevision(null);
      setTransferFromApproval(false);
      setActionNotice('Traspaso guardado y registrado en el historial.');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'No se pudo efectuar el traspaso.');
    }
  };
  const number = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });
  return (
    <section className={styles.tabContent} aria-label="Cotizaciones del proyecto">
      {isLoading ? <p className={styles.helper}>Consultando cotizaciones…</p>
        : error ? <p role="alert" className={styles.error}>No fue posible consultar las cotizaciones del proyecto.</p>
        : versions.length === 0 ? (
          <div className={styles.empty}>
            <strong>Este proyecto aún no tiene cotización</strong>
            <p>Créala con el agente IA, en blanco o copiando otra.</p>
            {eligible ? <Button onClick={() => setNewOpen(true)}>+ Nueva cotización</Button>
              : <span className={styles.helper}>Las nuevas versiones no están disponibles para este proyecto.</span>}
          </div>
        ) : (
          <>
            <div className={styles.head}>
              <div>
                <h3>Versiones de la cotización</h3>
                <p>Las versiones enviadas o aprobadas son históricas y no se editan.</p>
              </div>
              {eligible && <Button size="sm" onClick={() => setNewOpen(true)}>+ Nueva versión</Button>}
            </div>
            {closed ? (
              <p className={styles.closedNotice}>Cotización aprobada y traspasada a la ficha del proyecto. Historial cerrado: no se pueden crear nuevas versiones.</p>
            ) : versions.some((version) => version.status === 'approved') ? (
              <p className={styles.helper}>Cotización aprobada por el cliente · traspaso pendiente. La versión se conserva hasta confirmar el traspaso.</p>
            ) : null}
            <div className={styles.scroll}>
              <table className={styles.versions}>
                <thead><tr><th>Versión</th><th>Estado</th><th>Horas</th><th>Total</th><th>Acciones</th></tr></thead>
                <tbody>{versions.map((v) => {
                  const approvalBlockers = quotationCommercialBlockers(v, {
                    dirty: false, canOperate: eligible, demoProduction: import.meta.env.PROD,
                  });
                  return <tr key={v.id} className={v.status === 'sent' ? styles.sentRow : undefined}>
                    <td><strong>v{v.versionNumber} · {v.name}</strong>
                      <small>{new Date(v.createdAt).toLocaleDateString('es-CL')}
                        {v.origin === 'ai' ? (v.draft.aiPoc?.source === 'kdm_demo' ? ' · Agente IA (KDM demo)' : ' · Agente IA') : ''}</small></td>
                    <td><div className={styles.statuses}>
                      {data?.transferredVersionId === v.id ? <Badge tone="success">Traspasada</Badge> :
                        applied.data?.versionId === v.id ? <Badge tone="warning">Planificación previa</Badge> :
                          v.status === 'draft' ? <Badge tone="neutral">Borrador</Badge> :
                            v.status === 'sent' ? <Badge tone="info">Enviada al cliente</Badge> :
                              <Badge tone="success">Aprobada por el cliente</Badge>}
                      {!closed && v.status === 'draft' && v.origin === 'ai' && v.aiReviewStatus === 'pending' &&
                        <Badge tone="brand">✦ Por revisar</Badge>}
                    </div></td>
                    <td>{number(v.totalHours)} HH</td>
                    <td>{v.totalAmount === null ? 'Sin valor HH' : number(v.totalAmount) + ' ' + v.currency}</td>
                    <td>
                      <div className={styles.actionLinks}>
                        <Link to={projectQuotationPath(project) + '?version=' + v.id}>
                          Abrir en calculadora
                        </Link>
                        {eligible && (v.status === 'sent' || v.status === 'draft') &&
                          <div className={styles.approvalReadiness}>
                            {/* Un botón disabled puede no exponer title: también mostrar
                                el resumen de requisitos sin depender de hover. */}
                            <span title={approvalBlockers.length ? approvalBlockers.join('\n') : undefined}>
                              <Button size="sm" variant="ghost"
                                disabled={lifecycle.approveClient.isPending || approvalBlockers.length > 0}
                                onClick={() => registerApproval(v)}>
                                Registrar aprobación
                              </Button>
                            </span>
                            {approvalBlockers.length > 0 && (
                              <details className={styles.approvalRequirements}
                                aria-label={'Requisitos pendientes cotización v' + v.versionNumber}>
                                <summary>Faltan {approvalBlockers.length} requisitos</summary>
                                <ul>{approvalBlockers.map((reason) =>
                                  <li key={reason}>{reason}</li>)}</ul>
                                <Link to={projectQuotationPath(project) + '?version=' + v.id}>
                                  Completar en calculadora
                                </Link>
                              </details>
                            )}
                          </div>}
                        {eligible && v.status === 'approved' &&
                          data?.transferredVersionId !== v.id &&
                          <Button size="sm" variant="ghost"
                            disabled={lifecycle.transferApproved.isPending}
                            onClick={() => transferNow(v)}>
                            Traspasar ahora
                          </Button>}
                        {eligible && data?.transferredVersionId !== v.id && (
                          <Button size="sm" variant="ghost"
                            disabled={deleteVersion.isPending}
                            onClick={() => void removeVersion(v.id, v.revision, v.versionNumber, v.name)}>
                            Eliminar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            {transferredVersion && (
              <div className={styles.commercialSummary}>
                <h3>Resumen comercial · versión traspasada v{transferredVersion.versionNumber}</h3>
                <p>Consulta histórica; no modifica el proyecto operativo.</p>
                <div className={styles.summaryGrid}>
                  <span>Valor HH: <strong>{transferredVersion.hourlyRate ?? '—'} {transferredVersion.currency}</strong></span>
                  <span>HH cotizadas: <strong>{number(transferredVersion.totalHours)}</strong></span>
                  <span>Neto: <strong>{transferredVersion.netAmount ?? '—'} {transferredVersion.currency}</strong></span>
                  <span>Total: <strong>{transferredVersion.totalAmount ?? '—'} {transferredVersion.currency}</strong></span>
                </div>
                {transferredVersion.draft.costs.length > 0 && (
                  <p>Costos externos: {transferredVersion.draft.costs.map((cost) =>
                    cost.description + ' (' + cost.amount + ' ' + transferredVersion.currency + ' · ' +
                    cost.recurrence + ')').join('; ')}</p>
                )}
                {transferredVersion.draft.assumptions.length > 0 && (
                  <p>Supuestos: {transferredVersion.draft.assumptions.join('; ')}</p>
                )}
                <Link to={projectQuotationPath(project) + '?version=' + transferredVersion.id}>
                  Ver ficha comercial completa
                </Link>
              </div>
            )}
          </>
        )}
      {actionError && <p role="alert" className={styles.error}>{actionError}</p>}
      {actionNotice && <p role="status" className={styles.helper}>{actionNotice}</p>}
      {confirmationDialog}
      {approving && (
        <QuotationApprovalDialog project={project} version={approving}
          previouslyApprovedVersionNumber={data?.versions.find((candidate) =>
            candidate.status === 'approved' && candidate.id !== approving.id)?.versionNumber}
          timing={transferTiming} onTimingChange={setTransferTiming}
          pending={lifecycle.approveClient.isPending} error={actionError}
          onCancel={() => setApproving(null)}
          onApprove={() => void confirmApproval()} />
      )}
      {transferring && (
        <QuotationTransferDialog project={project} version={transferring} open
          afterApproval={transferFromApproval} pending={lifecycle.transferApproved.isPending}
          error={actionError} onClose={closeTransfer} onTransfer={() => void confirmTransfer()} />
      )}
      {eligible && newOpen && <NewProjectQuotationModal project={project} versions={data?.versions ?? []}
        onClose={() => setNewOpen(false)} />}
    </section>
  );
}
