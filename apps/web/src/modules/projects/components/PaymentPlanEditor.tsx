import { useState } from 'react';
import {
  PROJECT_CONTRACT_CURRENCIES,
  type ProjectContractCurrency,
  type ProjectDetail,
  type ProjectPaymentPlanItemInput,
  type ProjectPaymentStatus,
  type ProjectPaymentTrigger,
  type ProjectPhase,
} from '@kora/contracts';
import styles from './PaymentPlanEditor.module.css';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { MoneyField } from '@/shared/components/ui/MoneyField';
import { TextField } from '@/shared/components/ui/TextField';
import { InfoIcon, PlusIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { formatMoney } from '@/shared/lib/format-money';
import { PaymentTriggerFields } from './PaymentTriggerFields';
import { addToIsoDay, paymentStatusLabel, paymentStatusTone, paymentTriggerLabel } from '../lib/payment-milestone-display';

export interface PaymentPlanItemDraft {
  /** Clave estable de la fila en React — no es el id del tramo. */
  key: string;
  /** Id del tramo ya guardado; `undefined` en una fila nueva. */
  id?: string;
  name: string;
  percent: string;
  amount: string;
  triggerType: ProjectPaymentTrigger;
  triggerPhase: ProjectPhase | '';
  triggerDate: string;
  /** Solo filas guardadas: una facturada/pagada no se edita ni se quita desde acá. */
  status?: ProjectPaymentStatus;
  isOverdue?: boolean;
}

export interface PaymentPlanDraft {
  contractAmount: string;
  contractCurrency: ProjectContractCurrency;
  items: PaymentPlanItemDraft[];
}

let rowSeq = 0;
const nextKey = () => `row-${++rowSeq}`;

const CURRENCY_OPTIONS = PROJECT_CONTRACT_CURRENCIES.map((currency) => ({ value: currency, label: currency }));
const isLocked = (item: PaymentPlanItemDraft) => item.status === 'invoiced' || item.status === 'paid';
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Plan con el que parte un proyecto nuevo: Inicio al aprobarse, Marcha blanca al entrar en esa fase. */
export function defaultPaymentPlan(): PaymentPlanDraft {
  return {
    contractAmount: '',
    contractCurrency: 'UF',
    items: [
      { key: nextKey(), name: 'Inicio', percent: '50', amount: '', triggerType: 'approval', triggerPhase: '', triggerDate: '' },
      { key: nextKey(), name: 'Marcha blanca', percent: '50', amount: '', triggerType: 'phase', triggerPhase: 'pilot', triggerDate: '' },
    ],
  };
}

export function paymentPlanFromProject(project: Pick<ProjectDetail, 'contractAmount' | 'contractCurrency' | 'paymentMilestones'>): PaymentPlanDraft {
  return {
    contractAmount: project.contractAmount != null ? String(project.contractAmount) : '',
    contractCurrency: project.contractCurrency,
    items: [...project.paymentMilestones]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((milestone) => ({
        key: nextKey(),
        id: milestone.id,
        name: milestone.name,
        percent: milestone.percent != null ? String(milestone.percent) : '',
        amount: String(milestone.amount),
        triggerType: milestone.triggerType,
        triggerPhase: milestone.triggerPhase ?? '',
        triggerDate: milestone.triggerDate ?? '',
        status: milestone.status,
        isOverdue: milestone.isOverdue,
      })),
  };
}

/** Error de validación del plan, o `null` si se puede guardar. */
export function validatePaymentPlan(plan: PaymentPlanDraft): string | null {
  for (const [index, item] of plan.items.entries()) {
    if (isLocked(item)) continue;
    const label = item.name.trim() || `el tramo ${index + 1}`;
    if (!item.name.trim()) return `Ingresa el nombre del tramo ${index + 1} del plan de pago.`;
    if (item.amount === '' || Number(item.amount) < 0) return `Ingresa el monto de ${label}.`;
    if (item.percent !== '' && (Number(item.percent) < 0 || Number(item.percent) > 100)) {
      return `El porcentaje de ${label} debe estar entre 0 y 100.`;
    }
    if (item.triggerType === 'phase' && !item.triggerPhase) return `Selecciona la fase que activa ${label}.`;
    if (item.triggerType === 'date' && !item.triggerDate) return `Indica la fecha de cobro de ${label}.`;
  }
  return null;
}

/**
 * Datos de facturación que faltan para pasar el proyecto a Aprobado, o `null` si está completo. Al aprobarse,
 * los tramos empiezan a quedar Por facturar, y un tramo en 0 no tiene nada que facturar (ver
 * `PaymentMilestoneTriggerService`): por eso se exige al menos un tramo y que todos tengan monto.
 */
export function missingApprovalBillingData(plan: PaymentPlanDraft): string | null {
  if (plan.items.length === 0) {
    return 'Para que el proyecto quede Aprobado, completa el plan de pago: agrega al menos un tramo con su monto.';
  }
  const withoutAmount = plan.items.flatMap((item, index) =>
    !isLocked(item) && !(Number(item.amount) > 0) ? [item.name.trim() || `tramo ${index + 1}`] : [],
  );
  if (withoutAmount.length === 0) return null;
  const names = withoutAmount.length === 1 ? withoutAmount[0] : `${withoutAmount.slice(0, -1).join(', ')} y ${withoutAmount.at(-1)}`;
  return `Para que el proyecto quede Aprobado, completa los datos de facturación: falta el monto de ${names}. Ingresa el monto del contrato o el de cada tramo en el plan de pago.`;
}

/** Payload de `createProjectSchema`/`updateProjectSchema` — la lista completa reemplaza a la guardada. */
export function paymentPlanPayload(plan: PaymentPlanDraft): {
  contractAmount: number | null;
  contractCurrency: ProjectContractCurrency;
  paymentMilestones: ProjectPaymentPlanItemInput[];
} {
  return {
    contractAmount: plan.contractAmount === '' ? null : Number(plan.contractAmount),
    contractCurrency: plan.contractCurrency,
    paymentMilestones: plan.items.map((item, index) => ({
      ...(item.id ? { id: item.id } : {}),
      name: item.name.trim(),
      percent: item.percent === '' ? null : Number(item.percent),
      amount: item.amount === '' ? 0 : Number(item.amount),
      sortOrder: index,
      triggerType: item.triggerType,
      triggerPhase: item.triggerType === 'phase' && item.triggerPhase ? item.triggerPhase : null,
      triggerDate: item.triggerType === 'date' && item.triggerDate ? item.triggerDate : null,
    })),
  };
}

export interface PaymentPlanEditorProps {
  value: PaymentPlanDraft;
  onChange: (next: PaymentPlanDraft) => void;
  disabled?: boolean;
}

/**
 * Plan de pago del proyecto: monto y moneda del contrato, y sus tramos — cada uno con %, monto y el hito
 * que lo deja Por facturar (aprobación, fase, fecha o manual). Con monto de contrato, el monto de cada
 * tramo se calcula de su %. "Cuotas mensuales" arma N tramos por fecha, uno por mes. Lo usan el alta
 * del proyecto y "Editar proyecto"; los tramos ya facturados se muestran pero no se tocan.
 */
export function PaymentPlanEditor({ value, onChange, disabled }: PaymentPlanEditorProps) {
  const [quotaForm, setQuotaForm] = useState<{ count: string; firstDate: string } | null>(null);
  const contractAmount = value.contractAmount === '' ? null : Number(value.contractAmount);
  const currency = value.contractCurrency;

  const amountFor = (percent: string, fallback: string) =>
    contractAmount !== null && percent !== '' ? String(round2((contractAmount * Number(percent)) / 100)) : fallback;

  const setItems = (items: PaymentPlanItemDraft[]) => onChange({ ...value, items });
  const updateItem = (key: string, patch: Partial<PaymentPlanItemDraft>) =>
    setItems(value.items.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const onContractAmountChange = (raw: string) => {
    const amount = raw === '' ? null : Number(raw);
    // Los tramos con % siguen al monto del contrato; los que no tienen % (p.ej. un extra) se respetan.
    const items = value.items.map((item) =>
      isLocked(item) || amount === null || item.percent === ''
        ? item
        : { ...item, amount: String(round2((amount * Number(item.percent)) / 100)) },
    );
    onChange({ ...value, contractAmount: raw, items });
  };

  const addItem = () =>
    setItems([
      ...value.items,
      { key: nextKey(), name: '', percent: '', amount: '', triggerType: 'manual', triggerPhase: '', triggerDate: '' },
    ]);

  const generateQuotas = () => {
    if (!quotaForm) return;
    const count = Math.floor(Number(quotaForm.count));
    if (!count || count < 1 || count > 48 || !quotaForm.firstDate) return;
    const share = round2(100 / count);
    const quotas: PaymentPlanItemDraft[] = Array.from({ length: count }, (_, index) => {
      // La última cuota absorbe el redondeo para que el total sea exactamente 100%.
      const percent = index === count - 1 ? round2(100 - share * (count - 1)) : share;
      return {
        key: nextKey(),
        name: `Cuota ${index + 1}/${count}`,
        percent: String(percent),
        amount: amountFor(String(percent), ''),
        triggerType: 'date',
        triggerPhase: '',
        triggerDate: addToIsoDay(quotaForm.firstDate, { months: index }),
      };
    });
    // Reemplaza el plan editable; los tramos ya facturados/pagados se conservan.
    setItems([...value.items.filter(isLocked), ...quotas]);
    setQuotaForm(null);
  };

  const totalPercent = round2(value.items.reduce((sum, item) => sum + (item.percent === '' ? 0 : Number(item.percent)), 0));
  const totalAmount = round2(value.items.reduce((sum, item) => sum + (item.amount === '' ? 0 : Number(item.amount)), 0));
  const hasPercents = value.items.some((item) => item.percent !== '');
  const percentMismatch = hasPercents && totalPercent !== 100;
  const amountMismatch = contractAmount !== null && totalAmount !== contractAmount;
  const planMismatch = percentMismatch || amountMismatch;

  return (
    <div className={styles.editor}>
      <div className={styles.contractRow}>
        <MoneyField
          label="Monto del contrato"
          placeholder="Opcional — calcula el monto de cada tramo"
          min={0}
          value={value.contractAmount}
          currency={currency}
          currencyOptions={CURRENCY_OPTIONS}
          onCurrencyChange={(next) => onChange({ ...value, contractCurrency: next as ProjectContractCurrency })}
          onChange={(e) => onContractAmountChange(e.target.value)}
          disabled={disabled}
        />
        <div className={styles.toolbar}>
          <Button type="button" variant="outline" size="sm" onClick={addItem} disabled={disabled}>
            <PlusIcon size={14} /> Agregar tramo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setQuotaForm(quotaForm ? null : { count: '12', firstDate: '' })}
            disabled={disabled}
          >
            Cuotas mensuales
          </Button>
        </div>
      </div>

      {quotaForm && (
        <div className={styles.quotaPanel}>
          <p className={styles.quotaHint}>
            Reemplaza los tramos sin facturar por N cuotas iguales, una por mes desde la primera fecha. Cada cuota queda
            por facturar al llegar su fecha.
          </p>
          <div className={styles.quotaFields}>
            <TextField
              label="N° de cuotas"
              type="number"
              min={1}
              max={48}
              value={quotaForm.count}
              onChange={(e) => setQuotaForm({ ...quotaForm, count: e.target.value })}
            />
            <TextField
              label="Fecha de la primera cuota"
              type="date"
              value={quotaForm.firstDate}
              onChange={(e) => setQuotaForm({ ...quotaForm, firstDate: e.target.value })}
            />
            <div className={styles.quotaActions}>
              <Button type="button" variant="outline" size="sm" onClick={() => setQuotaForm(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={generateQuotas}
                disabled={!quotaForm.firstDate || !(Number(quotaForm.count) >= 1 && Number(quotaForm.count) <= 48)}
              >
                Generar cuotas
              </Button>
            </div>
          </div>
        </div>
      )}

      {value.items.length === 0 ? (
        <p className={styles.empty}>Sin tramos de pago. Agrega uno o genera cuotas mensuales.</p>
      ) : (
        <div className={styles.table} role="table" aria-label="Tramos del plan de pago">
          <div className={styles.headRow} role="row">
            <span role="columnheader">Tramo</span>
            <span role="columnheader">%</span>
            <span role="columnheader">Monto ({currency})</span>
            <span role="columnheader">Hito de cobro</span>
            <span role="columnheader">Fase / fecha</span>
            <span role="columnheader" aria-label="Acciones" />
          </div>
          {value.items.map((item, index) =>
            isLocked(item) ? (
              <div key={item.key} className={`${styles.row} ${styles.lockedRow}`} role="row">
                <span className={styles.lockedName}>{item.name}</span>
                <span>{item.percent === '' ? '—' : `${item.percent}%`}</span>
                <span>{formatMoney(Number(item.amount), currency)}</span>
                <span className={styles.lockedTrigger}>
                  {paymentTriggerLabel({
                    triggerType: item.triggerType,
                    triggerPhase: item.triggerPhase || null,
                    triggerDate: item.triggerDate || null,
                  })}
                </span>
                <span>
                  <Badge tone={paymentStatusTone(item.status!, item.isOverdue ?? false)}>
                    {paymentStatusLabel(item.status!, item.isOverdue ?? false)}
                  </Badge>
                </span>
                <span />
              </div>
            ) : (
              <div key={item.key} className={styles.row} role="row">
                <TextField
                  aria-label={`Nombre del tramo ${index + 1}`}
                  placeholder="Ej: Inicio"
                  value={item.name}
                  onChange={(e) => updateItem(item.key, { name: e.target.value })}
                  disabled={disabled}
                />
                <TextField
                  aria-label={`Porcentaje del tramo ${index + 1}`}
                  placeholder="%"
                  type="number"
                  min={0}
                  max={100}
                  value={item.percent}
                  onChange={(e) => updateItem(item.key, { percent: e.target.value, amount: amountFor(e.target.value, item.amount) })}
                  disabled={disabled}
                />
                <TextField
                  aria-label={`Monto del tramo ${index + 1}`}
                  placeholder="0"
                  type="number"
                  min={0}
                  value={item.amount}
                  onChange={(e) => updateItem(item.key, { amount: e.target.value })}
                  disabled={disabled}
                />
                <PaymentTriggerFields
                  compact
                  triggerType={item.triggerType}
                  triggerPhase={item.triggerPhase}
                  triggerDate={item.triggerDate}
                  onChange={(patch) => updateItem(item.key, patch)}
                  disabled={disabled}
                />
                {item.triggerType !== 'phase' && item.triggerType !== 'date' && <span className={styles.noValue}>—</span>}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar ${item.name || `tramo ${index + 1}`}`}
                  onClick={() => setItems(value.items.filter((other) => other.key !== item.key))}
                  disabled={disabled}
                >
                  <TrashIcon size={16} />
                </Button>
              </div>
            ),
          )}
        </div>
      )}

      {value.items.length > 0 && (
        <div className={`${styles.summary} ${planMismatch ? styles.summaryWarn : ''}`}>
          <div className={styles.summaryTitle}>
            <span className={styles.summaryLabel}>Total del plan</span>
            <span className={styles.summaryMeta}>
              {value.items.length} {value.items.length === 1 ? 'tramo' : 'tramos'}
            </span>
          </div>
          <div className={styles.summaryStats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Porcentaje</span>
              <span className={`${styles.statValue} ${percentMismatch ? styles.warnText : ''}`}>
                {hasPercents ? `${totalPercent.toLocaleString('es-CL')}%` : '—'}
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Monto de los tramos</span>
              <span className={`${styles.statValue} ${amountMismatch ? styles.warnText : ''}`}>
                {formatMoney(totalAmount, currency)}
              </span>
            </div>
            {contractAmount !== null && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Contrato</span>
                <span className={styles.statValue}>{formatMoney(contractAmount, currency)}</span>
              </div>
            )}
          </div>
          {planMismatch && (
            <p className={styles.warn}>
              <InfoIcon size={14} />
              {percentMismatch
                ? `Los porcentajes suman ${totalPercent.toLocaleString('es-CL')}%, no 100%.`
                : `Los tramos suman ${formatMoney(totalAmount, currency)}, distinto del monto del contrato.`}{' '}
              Puedes guardar igual (p.ej. si hay un tramo extra).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
