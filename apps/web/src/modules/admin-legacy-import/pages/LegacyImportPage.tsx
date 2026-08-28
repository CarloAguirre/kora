import { useRef, useState } from 'react';
import type { LegacyImportResponse } from '@kora/contracts';
import styles from './LegacyImportPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';
import { useRunLegacyImport } from '../api/legacy-import.queries';

/**
 * Importador de datos legacy por archivo.
 *
 * Sube el mismo CSV con la columna `dump` que ya se usa para migrar desde la
 * v1, y reemplaza catálogos, clientes, proyectos, horas, tickets y forecast
 * por lo que trae el archivo — borrando lo que ya no está. Es una operación
 * destructiva sobre datos reales, así que "Vista previa" es obligatorio antes
 * de poder confirmar: corre exactamente el mismo pipeline dentro de una
 * transacción que se revierte al final, para que el conteo mostrado sea
 * siempre el conteo real de lo que pasaría.
 */
export function LegacyImportPage() {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<LegacyImportResponse | null>(null);
  const runImport = useRunLegacyImport();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setPreview(null);
  };

  const handlePreview = async () => {
    if (!file) return;
    try {
      const result = await runImport.mutateAsync({ file, dryRun: true });
      setPreview(result);
      if (result.parseErrors.length > 0) {
        toast.error('El archivo tiene errores de formato — revisa el detalle abajo.');
      }
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.payload.message : 'No se pudo generar la vista previa.');
    }
  };

  const handleConfirm = async () => {
    if (!file) return;
    try {
      const result = await runImport.mutateAsync({ file, dryRun: false });
      setPreview(result);
      toast.success('Importación aplicada: los datos ya quedaron reemplazados.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.payload.message : 'La importación falló.');
    }
  };

  const canConfirm = preview !== null && preview.parseErrors.length === 0;

  return (
    <DashboardLayout title="Importar datos legacy">
      <div className={styles.page}>
        <Card>
          <p>
            Sube el archivo CSV con la columna <code>dump</code> (la misma consulta que ya usas para exportar la base legacy).
            Reemplaza clientes, proyectos, horas, tickets y forecast por lo que traiga el archivo — lo que ya no esté, se borra.
            Usuarios y equipos no se tocan.
          </p>

          <div className={styles.uploadRow}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              aria-label="Archivo de datos legacy"
            />
            {file && <span className={styles.fileName}>{file.name}</span>}
          </div>

          <div className={styles.actions}>
            <Button variant="secondary" onClick={handlePreview} disabled={!file} loading={runImport.isPending && preview === null}>
              Vista previa
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirm}
              disabled={!canConfirm}
              loading={runImport.isPending && preview !== null}
            >
              Confirmar y ejecutar
            </Button>
          </div>
        </Card>

        {preview && preview.parseErrors.length > 0 && (
          <Card>
            <strong>El archivo no se puede importar:</strong>
            <ul className={styles.parseErrors}>
              {preview.parseErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </Card>
        )}

        {preview && preview.parseErrors.length === 0 && (
          <Card>
            <p className={styles.summaryNote}>
              {preview.dryRun
                ? 'Ensayo: nada se escribió todavía. Esto es lo que pasaría si confirmas.'
                : 'Aplicado — esto es lo que se escribió de verdad.'}
              {' '}
              {preview.totalWarnings} aviso(s) en {(preview.durationMs / 1000).toFixed(1)}s.
            </p>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Paso</th>
                  <th>Leídos</th>
                  <th>Creados</th>
                  <th>Actualizados</th>
                  <th>Eliminados</th>
                  <th>Omitidos</th>
                </tr>
              </thead>
              <tbody>
                {preview.steps.map((step) => (
                  <tr key={step.step}>
                    <td>
                      {step.step}
                      {step.warnings.length > 0 && (
                        <ul className={styles.warnings}>
                          {step.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td>{step.read}</td>
                    <td>{step.created}</td>
                    <td>{step.updated}</td>
                    <td>{step.deleted}</td>
                    <td>{step.skipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
