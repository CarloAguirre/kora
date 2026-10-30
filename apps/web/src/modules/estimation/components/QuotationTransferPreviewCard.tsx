import { useState } from 'react';
import type { QuotationVersion } from '@kora/contracts';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { useQuotationTransferPreview } from '../api/quotation.queries';
import styles from './QuotationTransferPreviewCard.module.css';

const number = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const delta = (value: number) => (value > 0 ? '+' : '') + number(value);

export function QuotationTransferPreviewCard({
  projectId, version,
}: { projectId: string; version: QuotationVersion }) {
  const [visible, setVisible] = useState(false);
  const previewQuery = useQuotationTransferPreview(projectId, version.id, version.revision, visible);
  const preview = previewQuery.data;

  return (
    <Card>
      <div className={styles.header}>
        <div>
          <h2>R3 · Previsualización de traspaso</h2>
          <p>Compara la cotización guardada con las HH, equipos y cobros existentes. Solo lectura; no modifica la ejecución.</p>
        </div>
        <Button variant="outline" size="sm" aria-expanded={visible}
          onClick={() => setVisible((wasVisible) => !wasVisible)}>
          {visible ? 'Ocultar análisis' : 'Analizar conflictos'}
        </Button>
      </div>
      {visible && (
        <div className={styles.body}>
          {previewQuery.isLoading && <p role="status">Consultando estado operativo actual…</p>}
          {previewQuery.isError && (
            <p role="alert" className={styles.danger}>
              No se pudo consultar la previsualización. Verifica los permisos y el estado de la API.
            </p>
          )}
          {preview && (
            <>
              <div className={styles.blocked}>
                <strong>Traspaso deshabilitado</strong>
                <span>Esta vista no aprueba ni transfiere versiones. Las decisiones D04, D05 y D06 siguen abiertas.</span>
              </div>
              <div className={styles.metrics}>
                <div><span>HH vendidas actuales</span><strong>{number(preview.operational.soldHours)}</strong></div>
                <div><span>HH de la versión</span><strong>{number(preview.proposed.totalHours)}</strong></div>
                <div><span>Variación propuesta</span><strong>{delta(preview.difference.soldHoursDelta)}</strong></div>
                <div><span>HH consumidas</span><strong>{number(preview.operational.usedHours)}</strong></div>
              </div>
              <p className={styles.helper}>
                Proyecto: {preview.operational.status} / {preview.operational.salesStage ?? 'sin etapa comercial'}.
                {' '}Plan existente: {preview.operational.moduleCount} módulos, {preview.operational.taskCount} tareas
                y {preview.operational.segmentCount} tramos. La comparación no implica sustitución de esos registros.
              </p>
              <h3>Equipos — comparación de HH</h3>
              <div className={styles.scroll}>
                <table className={styles.table}>
                  <thead><tr><th>Equipo</th><th>Asignadas en proyecto</th><th>Propuestas</th><th>Diferencia</th></tr></thead>
                  <tbody>
                    {preview.teams.map((team) => (
                      <tr key={team.teamId}>
                        <td>{team.name}{!team.existsInProject && <small>Nuevo equipo propuesto</small>}</td>
                        <td>{team.currentAssignedHours === null ? 'Sin valor' : number(team.currentAssignedHours)}</td>
                        <td>{number(team.proposedHours)}</td>
                        <td>{team.delta === null ? 'No comparable' : delta(team.delta)}</td>
                      </tr>
                    ))}
                    {preview.teams.length === 0 && <tr><td colSpan={4}>Sin equipos en el proyecto ni en la cotización.</td></tr>}
                  </tbody>
                </table>
              </div>
              <h3>Facturación y cobros existentes</h3>
              <p className={styles.helper}>
                Pendientes: {preview.operational.milestoneCounts.pending} ·
                Por facturar: {preview.operational.milestoneCounts.toInvoice} ·
                Facturados: {preview.operational.milestoneCounts.invoiced} ·
                Pagados: {preview.operational.milestoneCounts.paid}.
                {' '}Se preservarán sus estados cuando se diseñe el traspaso definitivo.
              </p>
              <h3>Hallazgos del preflight</h3>
              <div className={styles.findings}>
                {preview.findings.map((finding) => (
                  <div key={finding.code} className={finding.severity === 'blocker' ? styles.blocker : styles.review}>
                    <strong>{finding.severity === 'blocker' ? 'Bloqueo' : 'Revisión'} · {finding.code}</strong>
                    <span>{finding.message}</span>
                  </div>
                ))}
              </div>
              <div className={styles.footer}>
                <span>Vista calculada: {new Date(preview.calculatedAt).toLocaleString('es-CL')}.
                  {' '}La ficha puede cambiar después; una futura acción de traspaso debe comprobar el estado de nuevo.</span>
                <Button variant="outline" size="sm" onClick={() => void previewQuery.refetch()}
                  disabled={previewQuery.isFetching}>Actualizar lectura</Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
