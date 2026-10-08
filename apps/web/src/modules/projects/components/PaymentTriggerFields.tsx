import {
  PROJECT_PAYMENT_TRIGGERS,
  PROJECT_PAYMENT_TRIGGER_LABELS,
  PROJECT_PHASES,
  PROJECT_PHASE_LABELS,
  type ProjectPaymentTrigger,
  type ProjectPhase,
} from '@kora/contracts';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';

const TRIGGER_OPTIONS = PROJECT_PAYMENT_TRIGGERS.map((trigger) => ({ value: trigger, label: PROJECT_PAYMENT_TRIGGER_LABELS[trigger] }));
const PHASE_OPTIONS = PROJECT_PHASES.map((phase) => ({ value: phase, label: PROJECT_PHASE_LABELS[phase] }));

const HELPER: Readonly<Record<ProjectPaymentTrigger, string>> = {
  approval: 'Queda por facturar cuando el proyecto pasa a Aprobado.',
  phase: 'Queda por facturar cuando el proyecto llega a esta fase (o a una posterior).',
  date: 'Queda por facturar desde esta fecha.',
  manual: 'No avanza solo: se cambia el estado a mano.',
};

export interface PaymentTriggerFieldsProps {
  triggerType: ProjectPaymentTrigger;
  triggerPhase: ProjectPhase | '';
  triggerDate: string;
  onChange: (patch: { triggerType?: ProjectPaymentTrigger; triggerPhase?: ProjectPhase | ''; triggerDate?: string }) => void;
  disabled?: boolean;
  /** Etiquetas visibles; en filas de tabla se ocultan (van en el encabezado) y quedan como `aria-label`. */
  compact?: boolean;
  /** Sin el texto de ayuda bajo el hito — para formularios en una fila, donde descuadra la altura. */
  hideHelper?: boolean;
}

/**
 * "Hito de cobro" de un tramo de pago: qué lo deja Por facturar (aprobación, fase, fecha o manual) y, según
 * el tipo, la fase o la fecha. Devuelve un fragmento para que cada formulario lo ubique en su propia grilla.
 */
export function PaymentTriggerFields({
  triggerType,
  triggerPhase,
  triggerDate,
  onChange,
  disabled,
  compact,
  hideHelper,
}: PaymentTriggerFieldsProps) {
  return (
    <>
      <Select
        {...(compact
          ? { 'aria-label': 'Hito de cobro' }
          : { label: 'Hito de cobro', ...(hideHelper ? {} : { helperText: HELPER[triggerType] }) })}
        options={TRIGGER_OPTIONS}
        value={triggerType}
        disabled={disabled}
        onChange={(e) => onChange({ triggerType: e.target.value as ProjectPaymentTrigger })}
      />
      {triggerType === 'phase' && (
        <Select
          {...(compact ? { 'aria-label': 'Fase' } : { label: 'Fase' })}
          options={PHASE_OPTIONS}
          placeholder="Selecciona la fase"
          value={triggerPhase}
          disabled={disabled}
          onChange={(e) => onChange({ triggerPhase: e.target.value as ProjectPhase })}
        />
      )}
      {triggerType === 'date' && (
        <TextField
          {...(compact ? { 'aria-label': 'Fecha de cobro' } : { label: 'Fecha de cobro' })}
          type="date"
          value={triggerDate}
          disabled={disabled}
          onChange={(e) => onChange({ triggerDate: e.target.value })}
        />
      )}
    </>
  );
}
