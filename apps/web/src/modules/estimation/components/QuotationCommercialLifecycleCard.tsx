import { useState } from 'react';
import type { ProjectDetail, ProjectQuotation, QuotationVersion } from '@kora/contracts';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { useQuotationLifecycle } from '../api/quotation.queries';
import styles from './QuotationCommercialLifecycleCard.module.css';

/** Los estados comerciales de la versión no son los estados del proyecto.
 * Aceptar IA no toca el Roadmap; traspasar exige aprobación del cliente. */
export function QuotationCommercialLifecycleCard({
  project, quotation, version, canOperate, hasUnsavedChanges, embedded = false,
}: {
  project: ProjectDetail;
  quotation: ProjectQuotation | null;
  version: QuotationVersion;
  canOperate: boolean;
  hasUnsavedChanges: boolean;
  /** Renderizar acciones dentro del resumen comercial, sin una tarjeta anidada. */
  embedded?: boolean;
}) {
  const actions = useQuotationLifecycle(project.id);
  const [transferTiming, setTransferTiming] = useState<'now' | 'later'>('later');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const transferred = quotation?.transferredVersionId === version.id;
  const isLatest = quotation?.versions.at(-1)?.id === version.id;
  const busy = actions.acceptAi.isPending || actions.markSent.isPending ||
    actions.approveClient.isPending || actions.transferApproved.isPending;
  const mayAct = canOperate && !hasUnsavedChanges && !busy;
  const proposalPending = version.origin === 'ai' && version.aiReviewStatus === 'pending';
  const demo = Boolean(version.draft.aiPoc);
  const planTotal = version.draft.paymentPlan.reduce((sum, row) => sum + row.percent, 0);
  const hasValidPlan = version.draft.paymentPlan.length > 0 && Math.abs(planTotal - 100) < 0.001;
  const hasRate = version.hourlyRate !== null && version.hourlyRate > 0;
  const edtMismatch = version.origin === 'ai' &&
    Boolean(version.draft.aiPoc?.edt) &&
    version.draft.analysisProjectionStatus === 'modified';
  const readyForClient = hasRate && version.totalHours > 0 && hasValidPlan &&
    !proposalPending && !edtMismatch && version.draft.teams.length > 0;

  const acceptAi = async () => {
    setError(''); setNotice('');
    if (!window.confirm(
      'Aceptar la propuesta IA no aprueba al cliente ni modifica HH, equipos o roadmap. ¿Confirmas?'
    )) return;
    try {
      await actions.acceptAi.mutateAsync({ versionId: version.id, revision: version.revision });
      setNotice('Propuesta IA aceptada para revisión comercial. El proyecto no ha cambiado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aceptar la propuesta.');
    }
  };

  const markSent = async () => {
    setError(''); setNotice('');
    if (!window.confirm(
      'Se registrará que la versión fue enviada al cliente y quedará bloqueada. ' +
      'Esta acción NO envía correos. ¿Confirmas el envío externo ya realizado?'
    )) return;
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
    if (!window.confirm(
      (withoutSend
        ? 'ATENCIÓN: esta versión está en BORRADOR y no hay un envío al cliente registrado. ' +
          'Debes haber recibido la aprobación explícita del cliente pese a ello. '
        : '') +
      'Confirma que el CLIENTE APROBÓ expresamente esta versión. ' +
      (demo ? 'ATENCIÓN: contiene evidencia KDM de demostración, ajena al proyecto. ' : '') +
      (initialTransfer
        ? 'Se intentará traspasar los datos al proyecto tras registrar la aprobación.'
        : 'El traspaso quedará pendiente; no cambiarán los equipos ni las HH.')
    )) return;
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
    if (!window.confirm(
      'Traspasar al proyecto una versión APROBADA: HH vendidas, equipos, fases y plan de pagos. ' +
      'Solo se permite sin historial operativo ni facturación. ¿Confirmas?'
    )) return;
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
      {proposalPending && version.status === 'draft' && (
        <div className={styles.action}>
          <div><strong>1. Revisión del agente IA</strong>
            <p>Confirma perfiles, HH y cualquier ajuste manual; guarda antes de aceptar.</p></div>
          <Button disabled={!mayAct || !isLatest ||
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
          <Button variant="outline" disabled={!mayAct || !readyForClient || !isLatest}
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
          <Select label="Tipo de traspaso" value={transferTiming}
            onChange={(event) => setTransferTiming(event.target.value as 'now' | 'later')}
            options={[
              { value: 'later', label: 'Aprobar y traspasar después' },
              { value: 'now', label: 'Aprobar y traspasar ahora' },
            ]}/>
          {transferTiming === 'now' && project.status !== 'draft' &&
            <p className={styles.warning}>Este proyecto no está en No iniciado.
              Por seguridad, la aprobación quedará pendiente de conciliación y traspaso.</p>}
          <Button disabled={!mayAct || !readyForClient || !isLatest}
            onClick={() => void approveClient()}>Registrar aprobación</Button>
        </div>
      )}
      {version.status === 'approved' && !transferred &&
        <div className={styles.action}>
          <div><strong>4. Traspaso pendiente</strong>
            <p>La versión aprobada permanece registrada. El proyecto todavía no ha recibido
              esta planificación.</p></div>
          <Button disabled={!mayAct || project.status !== 'draft' || !isLatest}
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
  return embedded ? <div className={styles.embedded}>{content}</div> : <Card>{content}</Card>;
}
