import { useState } from 'react';
import type { ProjectDetail, ProjectQuotation, QuotationVersion } from '@kora/contracts';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { useToast } from '@/shared/components/ui/Toast';
import { useConfirmAction } from '@/shared/components/ui/useConfirmAction';
import { QuotationApprovalDialog, QuotationTransferDialog } from './QuotationLifecycleDialogs';
import { useQuotationLifecycle } from '../api/quotation.queries';
import styles from './QuotationCommercialLifecycleCard.module.css';
import { quotationCommercialBlockers } from './quotation-commercial-blockers';

/** Los estados comerciales de la versión no son los estados del proyecto.
 * Aceptar IA no toca el Roadmap; traspasar exige aprobación del cliente. */
export function QuotationCommercialLifecycleCard({
  project, quotation, version, canOperate, hasUnsavedChanges, embedded = false,
  showAiAcceptance = true,
}: {
  project: ProjectDetail;
  quotation: ProjectQuotation | null;
  version: QuotationVersion;
  canOperate: boolean;
  hasUnsavedChanges: boolean;
  /** Renderizar acciones dentro del resumen comercial, sin una tarjeta anidada. */
  embedded?: boolean;
  /** La cabecera v5 ya ofrece aceptar IA; evita duplicar el botón lateral. */
  showAiAcceptance?: boolean;
}) {
  const actions = useQuotationLifecycle(project.id);
  const [transferTiming, setTransferTiming] = useState<'now' | 'later'>(
    project.status === 'draft' ? 'now' : 'later',
  );
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFromApproval, setTransferFromApproval] = useState(false);
  const [transferRevision, setTransferRevision] = useState<number | null>(null);
  const toast = useToast();
  const reportError = (message: string) => toast.error(message);
  const { confirm, dialog: confirmationDialog } = useConfirmAction();
  const transferred = quotation?.transferredVersionId === version.id;
  const busy = actions.acceptAi.isPending || actions.markSent.isPending ||
    actions.approveClient.isPending || actions.transferApproved.isPending;
  const mayAct = canOperate && !hasUnsavedChanges && !busy;
  const proposalPending = version.origin === 'ai' && version.aiReviewStatus === 'pending';
  const demo = Boolean(version.draft.aiPoc);
  const planTotal = version.draft.paymentPlan.reduce((sum, row) => sum + row.percent, 0);
  const hasValidPlan = version.draft.paymentPlan.length > 0 && Math.abs(planTotal - 100) < 0.001;
  const edtMismatch = version.origin === 'ai' &&
    Boolean(version.draft.aiPoc?.edt) &&
    version.draft.analysisProjectionStatus === 'modified';
  const blockers = quotationCommercialBlockers(version, {
    dirty: hasUnsavedChanges, canOperate,
    demoProduction: import.meta.env.PROD,
  });
  const readyForClient = blockers.length === 0;
  const ensureReadyForClient = (): boolean => {
    if (readyForClient) return true;
    toast.error('Para enviar o aprobar, resuelve: ' + blockers.join(' '));
    return false;
  };

  const acceptAi = async () => {
    if (!mayAct || version.draft.teams.length === 0) {
      toast.error(hasUnsavedChanges ? 'Guarda los cambios del borrador antes de aceptar la propuesta IA.'
        : 'Asigna primero las horas y equipos reales de Kora para aceptar la propuesta.');
      return;
    }
    if (!await confirm({ title: 'Aceptar propuesta IA', description: 'Esta acción no aprueba al cliente ni modifica las HH, los equipos o el Roadmap.', confirmLabel: 'Aceptar propuesta' })) return;
    try {
      await actions.acceptAi.mutateAsync({ versionId: version.id, revision: version.revision });
      toast.success('Propuesta IA aceptada para revisión comercial. El proyecto no ha cambiado.');
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'No se pudo aceptar la propuesta.');
    }
  };

  const markSent = async () => {
    if (!ensureReadyForClient()) return;
    if (!await confirm({ title: 'Registrar envío comercial', description: 'La versión quedará bloqueada. Esta acción NO envía correos: confirma un envío externo ya realizado.', confirmLabel: 'Registrar envío' })) return;
    try {
      await actions.markSent.mutateAsync({ versionId: version.id, revision: version.revision });
      toast.success('Envío registrado. La versión quedó bloqueada.');
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'No se pudo registrar el envío.');
    }
  };

  const openApproval = () => {
    if (!ensureReadyForClient()) return;
    setTransferTiming(project.status === 'draft' ? 'now' : 'later');
    setApprovalOpen(true);
  };

  const approveClient = async () => {
    const withoutSend = version.status === 'draft';
    try {
      const approved = await actions.approveClient.mutateAsync({
        versionId: version.id, revision: version.revision,
        ...(withoutSend ? { confirmWithoutSend: true as const } : {}),
      });
      setApprovalOpen(false);
      if (transferTiming === 'now' && project.status === 'draft') {
        // Igual que el prototipo: registrar aprobación y mostrar el resumen.
        // NO traspasar sin la segunda confirmación.
        setTransferRevision(approved.revision);
        setTransferFromApproval(true);
        setTransferOpen(true);
      } else {
        toast.success('Aprobación del cliente registrada. Traspaso pendiente.');
      }
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'No se pudo registrar la aprobación.');
    }
  };

  const openTransfer = () => {
    if (hasUnsavedChanges) {
      toast.error('Guarda los cambios de la cotización antes de traspasarla.');
      return;
    }
    if (project.status !== 'draft') {
      toast.error('El proyecto ya no está en No iniciado. Se requiere conciliación antes del traspaso.');
      return;
    }
    setTransferRevision(null);
    setTransferFromApproval(false);
    setTransferOpen(true);
  };

  const closeTransfer = () => {
    setTransferOpen(false);
    if (transferFromApproval) {
      toast.success('Aprobación registrada. Traspaso pendiente.');
    }
    setTransferFromApproval(false);
    setTransferRevision(null);
  };

  const transfer = async () => {
    try {
      await actions.transferApproved.mutateAsync({
        versionId: version.id, revision: transferRevision ?? version.revision,
      });
      setTransferOpen(false);
      setTransferRevision(null);
      setTransferFromApproval(false);
      toast.success('Traspaso registrado en el historial. La planificación quedó cargada.');
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'No fue posible traspasar la cotización.');
    }
  };

  const commercialDialogs = (
    <>
      {confirmationDialog}
      {approvalOpen && (
        <QuotationApprovalDialog project={project} version={version}
          previouslyApprovedVersionNumber={quotation?.versions.find((candidate) =>
            candidate.status === 'approved' && candidate.id !== version.id)?.versionNumber}
          timing={transferTiming} onTimingChange={setTransferTiming}
          pending={actions.approveClient.isPending}
          onCancel={() => setApprovalOpen(false)}
          onApprove={() => void approveClient()} />
      )}
      {transferOpen && (
        <QuotationTransferDialog project={project} version={version} open
          afterApproval={transferFromApproval} pending={actions.transferApproved.isPending}
          onClose={closeTransfer} onTransfer={() => void transfer()} />
      )}
    </>
  );

  const content = (
    <>
      <div className={styles.heading}>
        <h2>Ciclo comercial de la cotización</h2>
        <span>{transferred ? 'Traspasada' :
          version.status === 'approved' ? 'Aprobada · traspaso pendiente' :
          version.status === 'sent' ? 'Enviada al cliente' : 'Borrador'}</span>
      </div>
      <p className={styles.helper}>La aceptación del agente IA, la aprobación del cliente y
        el traspaso son operaciones distintas. Ninguna edición del borrador altera el proyecto.</p>
      {demo && <p className={styles.warning}>La fuente documental es el PDF KDM de prueba.
        No corresponde a los documentos reales de este proyecto.</p>}
      {showAiAcceptance && proposalPending && version.status === 'draft' && (
        <div className={styles.action}>
          <div><strong>1. Revisión del agente IA</strong>
            <p>Confirma perfiles, HH y cualquier ajuste manual; guarda antes de aceptar.</p></div>
          <Button disabled={!canOperate || busy}
            onClick={() => void acceptAi()}>Aceptar propuesta IA</Button>
        </div>
      )}
      {version.origin === 'ai' && version.aiReviewStatus === 'accepted' &&
        <p className={styles.success}>Propuesta IA revisada y aceptada. Aún no es aprobación del cliente.</p>}
      {version.status === 'draft' && (
        <div className={styles.action}>
          <div><strong>2. Envío comercial</strong>
            <p>Registrar un envío externo y bloquear esta versión.</p></div>
          <Button variant="outline" disabled={!canOperate || busy}
            onClick={() => void markSent()}>Marcar como enviada</Button>
        </div>
      )}
      {(version.status === 'sent' || version.status === 'draft') && (
        <div className={styles.approval}>
          <div><strong>3. Registrar aprobación del cliente</strong>
            <p>Requiere valor HH, plan de pago 100 % y aceptación IA si aplica.</p>
            {version.status === 'draft' && <p className={styles.warning}>
              No hay envío comercial registrado. Se solicitará confirmación explícita del
              cliente antes de aprobar directamente el borrador.
            </p>}</div>

          <Button disabled={!canOperate || busy}
            onClick={openApproval}>Registrar aprobación</Button>
        </div>
      )}
      {version.status === 'approved' && !transferred &&
        <div className={styles.action}>
          <div><strong>4. Traspaso pendiente</strong>
            <p>La versión aprobada permanece registrada. El proyecto todavía no ha recibido
              esta planificación.</p></div>
          <Button disabled={!canOperate || busy}
            onClick={openTransfer}>Traspasar ahora</Button>
        </div>}
      {transferred && <p className={styles.success}>
        Versión traspasada. Se registraron equipos, horas y plan de pagos.
      </p>}
      {hasUnsavedChanges && <p className={styles.warning}>
        Guarda los cambios del borrador antes de usar cualquier acción comercial.
      </p>}
      {edtMismatch && <p className={styles.warning}>
        El desglose de tareas Gemini no coincide con las HH ajustadas.
        Concilia la EDT antes de registrar un envío comercial.
      </p>}
      {!hasValidPlan && version.status === 'draft' &&
        <p className={styles.helper}>El plan de pagos debe sumar 100 % para enviar o aprobar.</p>}
    </>
  );
  if (embedded) {
    // Pantalla v5: el panel derecho muestra solo los botones comerciales.
    // Las validaciones permanecen activas en el backend y en los atributos
    // disabled/title de cada acción. El traspaso sigue siendo posterior.
    return (
      <div className={styles.v5Actions}>
        {commercialDialogs}
        {version.status === 'draft' &&
          <Button variant="outline" className={styles.v5Send}
            disabled={!canOperate || busy}
            onClick={() => void markSent()}>Marcar como enviada al cliente</Button>}
        {(version.status === 'sent' || version.status === 'draft') &&
          <Button className={styles.v5Approve}
            disabled={!canOperate || busy}
            onClick={openApproval}>Registrar aprobación del cliente</Button>}
        {version.status === 'approved' && !transferred &&
          <Button className={styles.v5Approve}
            disabled={!canOperate || busy}
            onClick={openTransfer}>Traspasar al proyecto</Button>}
        {transferred && <p className={styles.success}>Cotización aprobada y traspasada.</p>}
      </div>
    );
  }
  return <><Card>{content}</Card>{commercialDialogs}</>;
}
