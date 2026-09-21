import { useState } from 'react';
import { SUPPORT_PLAN_ALERT_LABELS, type MarkSupportInvoiceIssuedInput, type SupportPlanAlert, type SupportPlanWithInvoices } from '@kora/contracts';
import styles from './SupportPlanBillingAction.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { FileField } from '@/shared/components/ui/FileField';
import { AlertIcon, CheckIcon, TriangleAlertIcon } from '@/shared/components/icons/Icons';
import { ApiRequestError } from '@/shared/lib/api-client';
import { formatMoney } from '@/shared/lib/format-money';

const formatDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CL') : '—');
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

/** Texto genérico por tipo de alerta — el detalle exacto (qué tickets la causaron) vive en la lista de tickets, no acá. */
function alertDescription(alert: SupportPlanAlert): string {
  switch (alert.type) {
    case 'deviated_hours':
      return 'El consumo acumulado del contrato superó las HH contratadas — Kora lo detectó comparando el consumo acumulado contra el total de la bolsa.';
    case 'quota_expiring':
      return alert.daysUntilExpiry !== null
        ? `El cupo de horas acumuladas vence en ${alert.daysUntilExpiry} día${alert.daysUntilExpiry === 1 ? '' : 's'} si no se usa.`
        : 'El cupo de horas acumuladas está por vencer.';
    case 'last_period_overage':
      return 'Es el último período del contrato — el excedente de horas se cobra como hora extra en vez de pasar al próximo período.';
  }
}

export interface SupportPlanBillingActionProps {
  plan: SupportPlanWithInvoices;
  canManageBilling: boolean;
  onIssue: (input: MarkSupportInvoiceIssuedInput) => Promise<void>;
}

/**
 * Tarjeta de facturación del período en curso. Cuando el contrato tiene
 * alertas activas (horas desviadas, cupo por vencer…) se combinan en la
 * misma tarjeta roja junto al monto y el botón — igual que el mockup de
 * referencia — en vez de un banner de alerta separado de la acción.
 *
 * El formulario de "Marcar como facturado" se expande dentro de la propia
 * tarjeta (no un diálogo aparte): reemplaza a `IssueSupportInvoiceDialog`
 * para calzar con esa interacción del mockup.
 */
export function SupportPlanBillingAction({ plan, canManageBilling, onIssue }: SupportPlanBillingActionProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [folio, setFolio] = useState('');
  const [invoicedAt, setInvoicedAt] = useState('');
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const isToInvoice = plan.currentBillingStatus === 'to_invoice';
  const hasAlerts = plan.alerts.length > 0;
  const hasDeviatedAlert = plan.alerts.some((a) => a.type === 'deviated_hours');
  const deviatedHours = hasDeviatedAlert ? Math.max(0, plan.usedHours - plan.contractedHours) : null;

  const openForm = () => {
    setFolio('');
    setInvoicedAt(new Date().toISOString().slice(0, 10));
    setAttachmentName(null);
    setError(null);
    setFormOpen(true);
  };

  const submit = async () => {
    if (!folio.trim() || !invoicedAt) {
      setError('Ingresa el folio y la fecha de emisión.');
      return;
    }
    setError(null);
    setRunning(true);
    try {
      await onIssue({ folio: folio.trim(), invoicedAt, attachmentName: attachmentName ?? undefined });
      setFormOpen(false);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'No se pudo registrar la factura. Inténtalo de nuevo.');
    } finally {
      setRunning(false);
    }
  };

  if (!isToInvoice) {
    if (hasAlerts) {
      const lastInvoice = [...plan.invoices].sort((a, b) => b.periodKey.localeCompare(a.periodKey))[0];
      return (
        <Card className={styles.resolvedCard}>
          <CheckIcon size={17} className={styles.resolvedIcon} />
          <div className={styles.body}>
            {plan.alerts.map((alert) => (
              <div key={alert.type} className={styles.alertBlock}>
                <strong className={styles.alertTitle}>{SUPPORT_PLAN_ALERT_LABELS[alert.type]} — factura registrada</strong>
                <p className={styles.alertText}>{alertDescription(alert)}</p>
              </div>
            ))}
            {lastInvoice && (
              <p className={styles.resolvedNote}>
                Registrada — Folio {lastInvoice.folio}, emitida el {formatDate(lastInvoice.invoicedAt)}
              </p>
            )}
          </div>
        </Card>
      );
    }
    return (
      <Card>
        {plan.currentBillingStatus === 'invoiced' && (
          <p className={styles.hint}>Ya se registró la factura de este período — para marcarla como pagada, usa el historial de arriba.</p>
        )}
        {plan.currentBillingStatus === null && <p className={styles.hint}>No hay nada por facturar en el período en curso.</p>}
      </Card>
    );
  }

  return (
    <Card className={hasAlerts ? styles.alertCard : undefined}>
      {hasAlerts && <TriangleAlertIcon size={17} className={styles.alertIcon} />}
      <div className={styles.body}>
        {plan.alerts.map((alert) => (
          <div key={alert.type} className={styles.alertBlock}>
            <strong className={styles.alertTitle}>{SUPPORT_PLAN_ALERT_LABELS[alert.type]}</strong>
            <p className={styles.alertText}>{alertDescription(alert)}</p>
          </div>
        ))}

        <p className={styles.montoLine}>
          Monto a facturar: <strong>{formatMoney(plan.currentAmountUf, plan.currency)}</strong>
          {deviatedHours !== null && deviatedHours > 0 && ` (${formatHours(deviatedHours)}h × ${formatMoney(plan.extraHourValueUf, plan.currency)})`}
        </p>

        {canManageBilling && !formOpen && <Button onClick={openForm}>Marcar como facturado</Button>}

        {formOpen && (
          <div className={styles.inlineForm}>
            <TextField label="N° de documento (folio)" placeholder="Ej: 27846" value={folio} onChange={(e) => setFolio(e.target.value)} autoFocus />
            <TextField label="Fecha de emisión" type="date" value={invoicedAt} onChange={(e) => setInvoicedAt(e.target.value)} />
            <FileField label="Adjuntar PDF (opcional)" fileName={attachmentName} onChange={setAttachmentName} accept="application/pdf" />

            {error && (
              <div className={styles.formAlert} role="alert">
                <AlertIcon size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className={styles.inlineFormActions}>
              <Button variant="outline" onClick={() => setFormOpen(false)} disabled={running}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={() => void submit()} loading={running} loadingText="Guardando…">
                Guardar
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
