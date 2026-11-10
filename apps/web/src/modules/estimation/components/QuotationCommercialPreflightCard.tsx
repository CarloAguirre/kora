import { useState } from 'react';
import type { QuotationCommercialPreflight, QuotationVersion } from '@kora/contracts';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { useQuotationCommercialPreflight } from '../api/quotation.queries';
import { quotationApi } from '../api/quotation.api';
import styles from './QuotationCommercialPreflightCard.module.css';

const sections: Record<QuotationCommercialPreflight['findings'][number]['section'], string> = {
  version: 'Versión', teams: 'Equipos', scope: 'Fases y alcance',
  hours: 'Horas', pricing: 'Tarifas y montos', payments: 'Plan de pagos',
  ai: 'Análisis IA', project: 'Proyecto', policy: 'Reglas pendientes',
};
const number = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 4 });

/** Informa el contenido persistido de una versión; nunca ofrece envío comercial. */
export function QuotationCommercialPreflightCard({ projectId, version, hasUnsavedChanges = false }: {
  projectId: string;
  version: QuotationVersion;
  hasUnsavedChanges?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const query = useQuotationCommercialPreflight(projectId, version.id, version.revision, expanded);
  const preflight = query.data;
  const downloadDossier = async () => {
    if (!preflight || hasUnsavedChanges || downloading) return;
    setDownloading(true);
    setDownloadError('');
    try {
      // API vuelve a calcular la validación desde la versión persistida.
      // No confía en el resultado que pudo quedar cacheado en React Query.
      const dossier = await quotationApi.commercialDossier(projectId, version.id);
      if (dossier.projectId !== projectId || dossier.versionId !== version.id ||
          dossier.revision !== version.revision || dossier.deliveryEnabled !== false) {
        throw new Error('La versión cambió durante la descarga. Actualiza las cotizaciones.');
      }
      const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' });
      const objectUrl = URL.createObjectURL(blob);
      try {
        const link = window.document.createElement('a');
        link.href = objectUrl;
        link.download = 'kora-expediente-interno-' + projectId.slice(0, 8) +
          '-v' + dossier.versionNumber + '-r' + dossier.revision + '.json';
        window.document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (exception) {
      setDownloadError(exception instanceof Error ? exception.message : 'No se pudo descargar el expediente.');
    } finally {
      setDownloading(false);
    }
  };
  return (
    <Card>
      <div className={styles.header}>
        <div>
          <h2>R3-f · Validación comercial</h2>
          <p>Revisa la versión guardada antes de un futuro envío: equipos, fases, HH, montos, pagos e IA.</p>
        </div>
        <Button size="sm" variant="outline" aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}>
          {expanded ? 'Ocultar validación' : 'Validar cotización'}
        </Button>
      </div>
      {expanded && (
        <div className={styles.body}>
          <p className={styles.blocked}><strong>Envío deshabilitado.</strong>
            {' '}Esta validación no envía ni aprueba versiones; las reglas D02, D05 y D06 siguen abiertas.
          </p>
          {hasUnsavedChanges && <p role="status" className={styles.notice}>
            Hay cambios sin guardar. Los resultados corresponden a la última versión persistida, no al formulario actual.
          </p>}
          {query.isLoading && <p role="status">Validando contenido guardado…</p>}
          {query.isError && <p role="alert" className={styles.error}>
            No fue posible validar la cotización. Comprueba permisos y conexión con la API.
          </p>}
          {preflight && (
            <>
              <div className={styles.metrics}>
                <div><span>Bloqueos</span><strong>{preflight.blockerCount}</strong></div>
                <div><span>Advertencias</span><strong>{preflight.warningCount}</strong></div>
                <div><span>HH calculadas</span><strong>{number(preflight.summary.totalHours)}</strong></div>
                <div><span>Plan de pagos</span><strong>{number(preflight.summary.paymentPercent)} %</strong></div>
              </div>
              <p className={styles.status}>
                {preflight.contentChecksPassed
                  ? 'Sin bloqueos de contenido detectados. Esto NO habilita el envío comercial.'
                  : 'Se detectaron problemas de contenido que deben revisarse antes de un futuro envío.'}
              </p>
              <p className={styles.details}>
                Modo: {preflight.summary.mode === 'team' ? 'Por equipos' : 'Por fases'} ·
                {' '}{preflight.summary.teamCount} equipos · {preflight.summary.phaseCount} fases ·
                {' '}Monto neto: {preflight.summary.netAmount === null ? 'Sin calcular' : number(preflight.summary.netAmount) + ' ' + version.currency} ·
                {' '}Monto total: {preflight.summary.totalAmount === null ? 'Sin calcular' : number(preflight.summary.totalAmount) + ' ' + version.currency}
              </p>
              {preflight.findings.length === 0
                ? <p className={styles.details}>No se encontraron observaciones de contenido.</p>
                : (
                  <div className={styles.findings}>
                    {preflight.findings.map((item, index) => (
                      <div key={item.code + ':' + index} className={item.severity === 'blocker' ? styles.blocker : styles.warning}>
                        <strong>{item.severity === 'blocker' ? 'Bloqueo' : 'Advertencia'} · {sections[item.section]} · {item.code}</strong>
                        <span>{item.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              <div className={styles.dossier}>
                <strong>Expediente de revisión interna</strong>
                <p>Incluye el presupuesto guardado, sus validaciones y D02, D05 y D06 pendientes.
                  El archivo es una evidencia de trabajo, no una cotización aprobada ni enviada al cliente.</p>
                {downloadError && <p role="alert" className={styles.error}>{downloadError}</p>}
                <Button variant="outline" size="sm" loading={downloading}
                  disabled={hasUnsavedChanges || query.isFetching}
                  onClick={() => void downloadDossier()}>
                  Descargar expediente interno JSON
                </Button>
                {hasUnsavedChanges && <small>Guarda los cambios del formulario para habilitar la descarga.</small>}
              </div>
              <div className={styles.footer}>
                <small>Revisión {preflight.revision} · Lectura: {new Date(preflight.calculatedAt).toLocaleString('es-CL')}.
                  {' '}La validación debe repetirse al cambiar la versión o las condiciones operativas.</small>
                <Button size="sm" variant="outline" onClick={() => void query.refetch()}
                  disabled={query.isFetching}>Actualizar validación</Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
