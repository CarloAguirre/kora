import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isQuotationDraftEligibleProject, type ProjectDetail } from '@kora/contracts';
import { projectQuotationPath } from '@/app/router/paths';
import { useAppliedQuotationPlanning, useDeleteQuotationVersion, useProjectQuotation, useQuotationLifecycle } from '../api/quotation.queries';
import { Button } from '@/shared/components/ui/Button';
import { useConfirmAction } from '@/shared/components/ui/useConfirmAction';
import { NewProjectQuotationModal } from './NewProjectQuotationModal';
import styles from './ProjectQuotationCard.module.css';

export function ProjectQuotationCard({ project }: { project: ProjectDetail }) {
  const { data, isLoading, error } = useProjectQuotation(project.id);
  const applied = useAppliedQuotationPlanning(project.id);
  const lifecycle = useQuotationLifecycle(project.id);
  const deleteVersion = useDeleteQuotationVersion(project.id);
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const { confirm, dialog: confirmationDialog } = useConfirmAction();
  const versions = [...(data?.versions ?? [])].sort((a, b) => b.versionNumber - a.versionNumber);
  const eligible = isQuotationDraftEligibleProject(project);
  const transferredVersion = versions.find((version) => version.id === data?.transferredVersionId);
  const registerApproval = async (versionId: string, revision: number, withoutSend: boolean) => {
    setActionError(''); setActionNotice('');
    if (!await confirm({ title: 'Registrar aprobación del cliente', confirmLabel: 'Confirmar aprobación', description: (withoutSend
      ? 'ATENCIÓN: no existe registro de envío comercial de este borrador. ' +
        'Debes confirmar que el cliente lo aprobó explícitamente. '
      : '') +
      '¿Confirmas que el cliente aprobó expresamente esta versión? ' +
      'Las HH del proyecto NO se modificarán hasta el traspaso.' })) return;
    try {
      await lifecycle.approveClient.mutateAsync({ versionId, revision,
        ...(withoutSend ? { confirmWithoutSend: true as const } : {}) });
      setActionNotice('Aprobación registrada · traspaso pendiente.');
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
  const transferNow = async (versionId: string, revision: number) => {
    setActionError(''); setActionNotice('');
    if (!await confirm({ title: 'Traspasar cotización al proyecto', description: 'Se transferirán equipos, HH, fases y pagos de una versión aprobada. La operación no reemplazará automáticamente la ejecución existente.', confirmLabel: 'Traspasar' })) return;
    try {
      await lifecycle.transferApproved.mutateAsync({ versionId, revision });
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
            {versions[0]?.status === 'approved' && data?.transferredVersionId !== versions[0]?.id && (
              <p className={styles.helper}>Existe una versión aprobada con traspaso pendiente.</p>
            )}
            <div className={styles.scroll}>
              <table className={styles.versions}>
                <thead><tr><th>Versión</th><th>Estado</th><th>Horas</th><th>Total</th><th>Acciones</th></tr></thead>
                <tbody>{versions.map((v) => (
                  <tr key={v.id} className={v.status === 'sent' ? styles.sentRow : undefined}>
                    <td><strong>v{v.versionNumber} · {v.name}</strong>
                      <small>{new Date(v.createdAt).toLocaleDateString('es-CL')}
                        {v.origin === 'ai' ? ' · Origen IA (KDM de prueba)' : ''}</small></td>
                    <td><span className={styles.status}>
                      {data?.transferredVersionId === v.id ? 'Traspasada' :
                        applied.data?.versionId === v.id ? 'Planificación previa (sin aprobación)' :
                        v.status === 'draft' ? 'Borrador' :
                          v.status === 'sent' ? 'Enviada al cliente' : 'Aprobada · traspaso pendiente'}
                    </span></td>
                    <td>{number(v.totalHours)} HH</td>
                    <td>{v.totalAmount === null ? 'Sin valor HH' : number(v.totalAmount) + ' ' + v.currency}</td>
                    <td>
                      <div className={styles.actionLinks}>
                        <Link to={projectQuotationPath(project) + '?version=' + v.id}>
                          Abrir en calculadora
                        </Link>
                        {eligible && (v.status === 'sent' || v.status === 'draft') &&
                          <Button size="sm" variant="ghost"
                            disabled={lifecycle.approveClient.isPending}
                            onClick={() => void registerApproval(v.id, v.revision, v.status === 'draft')}>
                            Registrar aprobación
                          </Button>}
                        {eligible && v.status === 'approved' &&
                          data?.transferredVersionId !== v.id &&
                          <Button size="sm" variant="ghost"
                            disabled={lifecycle.transferApproved.isPending || project.status !== 'draft'}
                            onClick={() => void transferNow(v.id, v.revision)}>
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
                  </tr>
                ))}</tbody>
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
      {newOpen && <NewProjectQuotationModal project={project} versions={data?.versions ?? []}
        onClose={() => setNewOpen(false)} />}
    </section>
  );
}
