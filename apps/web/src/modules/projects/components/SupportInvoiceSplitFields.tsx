import { useCallback, useMemo, useState } from 'react';
import { MAX_SUPPORT_INVOICES_PER_PERIOD, type SupportInvoiceDocumentInput, type SupportPlanCurrency } from '@kora/contracts';
import styles from './SupportInvoiceSplitFields.module.css';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { FileField } from '@/shared/components/ui/FileField';
import { CircleCheckIcon, PlusIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { formatMoney } from '@/shared/lib/format-money';

interface InvoiceDraft {
  readonly key: number;
  readonly folio: string;
  readonly invoicedAt: string;
  /** Texto del input — se valida y convierte al guardar. */
  readonly amount: string;
  readonly attachmentName: string | null;
}

const toCents = (value: number) => Math.round(value * 100);
const centsToInput = (cents: number) => (cents > 0 ? (cents / 100).toFixed(2) : '');
const today = () => new Date().toISOString().slice(0, 10);

let nextKey = 0;
function newDraft(amountCents: number, invoicedAt = today()): InvoiceDraft {
  return { key: ++nextKey, folio: '', invoicedAt, amount: centsToInput(amountCents), attachmentName: null };
}

function draftCents(draft: InvoiceDraft): number | null {
  const value = Number(draft.amount.replace(',', '.'));
  return draft.amount.trim() !== '' && Number.isFinite(value) ? toCents(value) : null;
}

export type SupportInvoiceSplit = ReturnType<typeof useSupportInvoiceSplit>;

/**
 * Estado del formulario de registro de facturas de un período: una o varias
 * facturas que, entre todas, cubren exactamente `totalAmount`. Con una sola
 * factura el monto es el total (no se pide). Al dividir, el total se reparte
 * en dos mitades; cada factura que se agrega después arranca con lo que falta
 * por asignar.
 */
export function useSupportInvoiceSplit(totalAmount: number) {
  const totalCents = toCents(totalAmount);
  const [drafts, setDrafts] = useState<InvoiceDraft[]>(() => [newDraft(totalCents)]);

  const isSplit = drafts.length > 1;
  const assignedCents = useMemo(
    () => (isSplit ? drafts.reduce((total, draft) => total + (draftCents(draft) ?? 0), 0) : totalCents),
    [drafts, isSplit, totalCents],
  );

  const reset = useCallback(() => setDrafts([newDraft(totalCents)]), [totalCents]);

  const add = () =>
    setDrafts((current) => {
      if (current.length >= MAX_SUPPORT_INVOICES_PER_PERIOD) return current;
      const last = current.at(-1)!;
      if (current.length === 1) {
        const half = Math.floor(totalCents / 2);
        return [{ ...last, amount: centsToInput(totalCents - half) }, newDraft(half, last.invoicedAt)];
      }
      const assigned = current.reduce((total, draft) => total + (draftCents(draft) ?? 0), 0);
      return [...current, newDraft(totalCents - assigned, last.invoicedAt)];
    });

  const remove = (key: number) =>
    setDrafts((current) => {
      const next = current.filter((draft) => draft.key !== key);
      // Si queda una sola, vuelve a cubrir el total.
      return next.length === 1 ? [{ ...next[0]!, amount: centsToInput(totalCents) }] : next;
    });

  const update = (key: number, patch: Partial<Omit<InvoiceDraft, 'key'>>) =>
    setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));

  /** Mensaje del primer problema, o `null` si se puede guardar. */
  const validate = (): string | null => {
    if (drafts.some((draft) => !draft.folio.trim() || !draft.invoicedAt)) {
      return isSplit ? 'Ingresa el folio y la fecha de emisión de cada factura.' : 'Ingresa el folio y la fecha de emisión.';
    }
    const folios = drafts.map((draft) => draft.folio.trim());
    if (new Set(folios).size !== folios.length) return 'Hay folios repetidos.';
    if (!isSplit) return null;
    if (drafts.some((draft) => (draftCents(draft) ?? 0) <= 0)) return 'Ingresa un monto mayor a 0 en cada factura.';
    if (assignedCents !== totalCents) return 'Los montos de las facturas tienen que sumar exactamente el total a facturar.';
    return null;
  };

  const toInput = (): SupportInvoiceDocumentInput[] =>
    drafts.map((draft) => ({
      folio: draft.folio.trim(),
      invoicedAt: draft.invoicedAt,
      amountUf: (isSplit ? (draftCents(draft) ?? 0) : totalCents) / 100,
      attachmentName: draft.attachmentName ?? undefined,
    }));

  return { drafts, isSplit, totalCents, assignedCents, reset, add, remove, update, validate, toInput };
}

export interface SupportInvoiceSplitFieldsProps {
  split: SupportInvoiceSplit;
  currency: SupportPlanCurrency;
  disabled?: boolean;
}

/**
 * Campos de "Registrar factura". Con una sola factura: folio, fecha y PDF,
 * apilados. Al dividir el total: una fila compacta por factura (folio, fecha,
 * monto, PDF) bajo un encabezado común, y una fila de total que muestra si
 * los montos ya cuadran. Compartido por `IssueSupportInvoiceDialog` y
 * `SupportPlanBillingAction` — ambos se ensanchan cuando `split.isSplit`.
 */
export function SupportInvoiceSplitFields({ split, currency, disabled }: SupportInvoiceSplitFieldsProps) {
  const { drafts, isSplit } = split;
  const canAdd = drafts.length < MAX_SUPPORT_INVOICES_PER_PERIOD;

  if (!isSplit) {
    const draft = drafts[0]!;
    return (
      <div className={styles.single}>
        <div className={styles.singleRow}>
          <TextField
            label="N° de documento (folio)"
            placeholder="Ej: 27846"
            value={draft.folio}
            onChange={(e) => split.update(draft.key, { folio: e.target.value })}
            autoFocus
            disabled={disabled}
          />
          <TextField
            label="Fecha de emisión"
            type="date"
            value={draft.invoicedAt}
            onChange={(e) => split.update(draft.key, { invoicedAt: e.target.value })}
            disabled={disabled}
          />
        </div>
        <FileField
          label="Adjuntar PDF (opcional)"
          fileName={draft.attachmentName}
          onChange={(attachmentName) => split.update(draft.key, { attachmentName })}
          accept="application/pdf"
          disabled={disabled}
        />
        <div className={styles.splitPrompt}>
          <span>¿El cliente necesita el monto en más de un documento?</span>
          <Button variant="ghost" size="sm" iconLeft={<PlusIcon size={14} />} onClick={split.add} disabled={disabled}>
            Dividir en varias facturas
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.table} role="group" aria-label="Facturas del período">
      <div className={[styles.gridRow, styles.head].join(' ')} aria-hidden="true">
        <span />
        <span>N° de documento (folio)</span>
        <span>Fecha de emisión</span>
        <span className={styles.alignRight}>Monto ({currency})</span>
        <span>PDF (opcional)</span>
        <span />
      </div>

      {drafts.map((draft, index) => {
        const n = index + 1;
        return (
          <div key={draft.key} className={[styles.gridRow, styles.invoiceRow].join(' ')}>
            <span className={styles.index}>{n}</span>
            <TextField
              aria-label={`Folio de la factura ${n}`}
              placeholder="Ej: 27846"
              value={draft.folio}
              onChange={(e) => split.update(draft.key, { folio: e.target.value })}
              autoFocus={index === drafts.length - 1}
              disabled={disabled}
            />
            <TextField
              aria-label={`Fecha de emisión de la factura ${n}`}
              type="date"
              value={draft.invoicedAt}
              onChange={(e) => split.update(draft.key, { invoicedAt: e.target.value })}
              disabled={disabled}
            />
            <TextField
              aria-label={`Monto de la factura ${n} (${currency})`}
              placeholder="0.00"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={draft.amount}
              onChange={(e) => split.update(draft.key, { amount: e.target.value })}
              className={styles.amountField}
              disabled={disabled}
            />
            <FileField
              fileName={draft.attachmentName}
              onChange={(attachmentName) => split.update(draft.key, { attachmentName })}
              accept="application/pdf"
              disabled={disabled}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Quitar la factura ${n}`}
              title="Quitar"
              onClick={() => split.remove(draft.key)}
              disabled={disabled}
            >
              <TrashIcon size={16} />
            </Button>
          </div>
        );
      })}

      <SplitTotalRow split={split} currency={currency} />

      {canAdd && (
        <Button variant="ghost" size="sm" iconLeft={<PlusIcon size={14} />} onClick={split.add} disabled={disabled} className={styles.addButton}>
          Agregar otra factura
        </Button>
      )}
    </div>
  );
}

/** Total asignado contra el total del período — en verde cuando cuadra, en rojo con lo que falta o sobra. */
function SplitTotalRow({ split, currency }: { split: SupportInvoiceSplit; currency: SupportPlanCurrency }) {
  const remainingCents = split.totalCents - split.assignedCents;
  const matches = remainingCents === 0;
  return (
    <div className={[styles.gridRow, styles.totalRow].join(' ')}>
      <span className={styles.totalLabel}>Total asignado</span>
      <span className={[styles.alignRight, styles.totalAmount].join(' ')}>{formatMoney(split.assignedCents / 100, currency)}</span>
      <span className={[styles.totalStatus, matches ? styles.statusOk : styles.statusPending].join(' ')} aria-live="polite">
        {matches ? (
          <>
            <CircleCheckIcon size={15} />
            Cuadra con el total
          </>
        ) : remainingCents > 0 ? (
          `Faltan ${formatMoney(remainingCents / 100, currency)} de ${formatMoney(split.totalCents / 100, currency)}`
        ) : (
          `Sobran ${formatMoney(-remainingCents / 100, currency)} sobre ${formatMoney(split.totalCents / 100, currency)}`
        )}
      </span>
    </div>
  );
}
