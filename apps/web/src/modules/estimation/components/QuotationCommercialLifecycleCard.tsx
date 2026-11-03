import { useState } from 'react';
import type { ProjectDetail, ProjectQuotation, QuotationVersion } from '@kora/contracts';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { useConfirmAction } from '@/shared/components/ui/useConfirmAction';
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
  const [transferTiming, setTransferTiming] = useState<'now' | 'later'>('later');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
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

  const acceptAi = async () => {
    setError(''); setNotice('');
    if (!await confirm({ title: 'Aceptar propuesta IA', description: 'Esta acción no aprueba al cliente ni modifica las HH, los equipos o el Roadmap.', confirmLabel: 'Aceptar propuesta' })) return;
    try {
      await actions.acceptAi.mutateAsync({ versionId: version.id, revision: version.revision });
      setNotice('Propuesta IA aceptada para revisión comercial. El proyecto no ha cambiado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aceptar la propuesta.');
    }
  };

  const markSent = async () => {
    setError(''); setNotice('');
    if (!await confirm({ title: 'Registrar envío comercial', description: 'La versión quedará bloqueada. Esta acción NO envía correos: confirma un envío externo ya realizado.', confirmLabel: 'Registrar envío' })) return;
    try {
      await actions.markSent.mutateAsync({ versionId: version.id, revision: version.revision });
      setNotice('Envío registrado. La versión quedó bloqueada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el envío.');
    }
  };

  const approveClient = async () => {
    setError(''); setNotice('');
    const initialTransfer = project.status === 'draft' && transferTiming === 'now';
    const withoutSend = version.status === 'draft';
    if (!await confirm({ title: 'Registrar aprobación del cliente', confirmLabel: 'Confirmar aprobación', description:
      (withoutSend
        ? 'ATENCIÓN: esta versión está en BORRADOR y no hay un envío al cliente registrado. ' +
          'Debes haber recibido la aprobación explícita del cliente pese a ello. '
        : '') +
      'Confirma que el CLIENTE APROBÓ expresamente esta versión. ' +
      (demo ? 'ATENCIÓN: contiene evidencia KDM de demostración, ajena al proyecto. ' : '') +
      (initialTransfer
        ? 'Se intentará traspasar los datos al proyecto tras registrar la aprobación.'
        : 'El traspaso quedará pendiente; no cambiarán los equipos ni las HH.')
    })) return;
    try {
      const approved = await actions.approveClient.mutateAsync({
        versionId: version.id, revision: version.revision,
        ...(withoutSend ? { confirmWithoutSend: true as const } : {}),
      });
      if (!initialTransfer) {
        setNotice('Aprobación del cliente registrada. Traspaso pendiente.');
        return;
      }
      try {
        await actions.transferApproved.mutateAsync({
          versionId: version.id, revision: approved.revision,
        });
        setNotice('Cotización aprobada y traspasada a la planificación inicial.');
      } catch (err) {
        setError('La aprobación quedó registrada, pero el traspaso sigue PENDIENTE: ' +
          (err instanceof Error ? err.message : 'Error de transferencia.'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la aprobación.');
    }
  };

  const transfer = async () => {
    setError(''); setNotice('');
    if (!await confirm({ title: 'Traspasar cotización aprobada', description: 'Se transferirán HH vendidas, equipos, fases y plan de pagos. La información operativa preexistente está protegida y puede requerir conciliación.', confirmLabel: 'Traspasar cotización' })) return;
    try {
      await actions.transferApproved.mutateAsync({
        versionId: version.id, revision: version.revision,
      });
      setNotice('Traspaso registrado en el historial. La planificación quedó cargada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible traspasar la cotización.');
    }
  };

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
          <Button disabled={!mayAct ||
            version.draft.teams.length === 0}
            onClick={() => void acceptAi()}>Aceptar propuesta IA</Button>
        </div>
      )}
      {version.origin === 'ai' && version.aiReviewStatus === 'accepted' &&
        <p className={styles.success}>Propuesta IA revisada y aceptada. Aún no es aprobación del cliente.</p>}
      {version.status === 'draft' && (
        <div className={styles.action}>
          <div><strong>2. Envío comercial</strong>
            <p>Registrar un envío externo y bloquear esta versión.</p></div>
          <Button variant="outline" disabled={!mayAct || !readyForClient}
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
          <details className={styles.transferTiming}>
            <summary>Opciones de aprobación y traspaso</summary>
            <Select label="Tipo de traspaso" value={transferTiming}
              onChange={(event) => setTransferTiming(event.target.value as 'now' | 'later')}
              options={[
                { value: 'later', label: 'Aprobar y traspasar después' },
                { value: 'now', label: 'Aprobar y traspasar ahora' },
              ]}/>
          </details>
          {transferTiming === 'now' && project.status !== 'draft' &&
            <p className={styles.warning}>Este proyecto no está en No iniciado.
              Por seguridad, la aprobación quedará pendiente de conciliación y traspaso.</p>}
          <Button disabled={!mayAct || !readyForClient}
            onClick={() => void approveClient()}>Registrar aprobación</Button>
        </div>
      )}
      {version.status === 'approved' && !transferred &&
        <div className={styles.action}>
          <div><strong>4. Traspaso pendiente</strong>
            <p>La versión aprobada permanece registrada. El proyecto todavía no ha recibido
              esta planificación.</p></div>
          <Button disabled={!mayAct || project.status !== 'draft'}
            onClick={() => void transfer()}>Traspasar ahora</Button>
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
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.success}>{notice}</p>}
    </>
  );
  if (embedded) {
    // Pantalla v5: el panel derecho muestra solo los botones comerciales.
    // Las validaciones permanecen activas en el backend y en los atributos
    // disabled/title de cada acción. El traspaso sigue siendo posterior.
    return (
      <div className={styles.v5Actions}>
        {confirmationDialog}
        {version.status === 'draft' &&
          <Button variant="outline" className={styles.v5Send}
            disabled={!mayAct || !readyForClient}
            title={blockers.length ? blockers.join(' ') : undefined}
            onClick={() => void markSent()}>Marcar como enviada al cliente</Button>}
        {(version.status === 'sent' || version.status === 'draft') &&
          <Button className={styles.v5Approve}
            disabled={!mayAct || !readyForClient}
            title={blockers.length ? blockers.join(' ') : undefined}
            onClick={() => void approveClient()}>Registrar aprobación del cliente</Button>}
        {version.status === 'approved' && !transferred &&
          <Button className={styles.v5Approve}
            disabled={!mayAct || project.status !== 'draft'}
            onClick={() => void transfer()}>Traspasar al proyecto</Button>}
        {blockers.length > 0 && (version.status === 'draft' || version.status === 'sent') && (
          <div className={styles.checklist} role="status" aria-label="Requisitos comerciales pendientes">
            <strong>Para habilitar envío y aprobación:</strong>
            <ul>{blockers.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          </div>
        )}
        {transferred && <p className={styles.success}>Cotización aprobada y traspasada.</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {notice && <p role="status" className={styles.success}>{notice}</p>}
      </div>
    );
  }
  return <><Card>{content}</Card>{confirmationDialog}</>;
}
