import {
  SUPPORT_INVOICE_BILLING_STATUS_LABELS,
  SUPPORT_INVOICE_PAYMENT_STATUS_LABELS,
  SUPPORT_PLAN_SCOPE_LABELS,
  SUPPORT_PLAN_STATUS_LABELS,
  SUPPORT_PLAN_TYPE_LABELS,
  type SupportInvoiceBillingStatus,
  type SupportInvoicePaymentStatus,
  type SupportPlanScope,
  type SupportPlanStatus,
  type SupportPlanType,
} from '@kora/contracts';
import { Badge, type BadgeTone } from '@/shared/components/ui/Badge';

const TYPE_TONE: Readonly<Record<SupportPlanType, BadgeTone>> = {
  on_demand: 'info',
  bundle: 'brand',
  monthly: 'neutral',
};

export function SupportPlanTypeBadge({ planType }: { planType: SupportPlanType }) {
  return <Badge tone={TYPE_TONE[planType]}>{SUPPORT_PLAN_TYPE_LABELS[planType]}</Badge>;
}

export function SupportPlanScopeBadge({ scope }: { scope: SupportPlanScope }) {
  if (scope === 'single') return null;
  return <Badge tone="brand">{SUPPORT_PLAN_SCOPE_LABELS[scope]}</Badge>;
}

const PLAN_STATUS_TONE: Readonly<Record<SupportPlanStatus, BadgeTone>> = {
  active: 'success',
  ended: 'neutral',
  cancelled: 'danger',
};

export function SupportPlanStatusBadge({ status }: { status: SupportPlanStatus }) {
  return <Badge tone={PLAN_STATUS_TONE[status]}>{SUPPORT_PLAN_STATUS_LABELS[status]}</Badge>;
}

const BILLING_TONE: Readonly<Record<SupportInvoiceBillingStatus, BadgeTone>> = {
  to_invoice: 'warning',
  invoiced: 'info',
};

export function SupportInvoiceBillingStatusBadge({ status }: { status: SupportInvoiceBillingStatus | null }) {
  if (!status) return <Badge tone="neutral">Sin movimiento</Badge>;
  return <Badge tone={BILLING_TONE[status]}>{SUPPORT_INVOICE_BILLING_STATUS_LABELS[status]}</Badge>;
}

const PAYMENT_TONE: Readonly<Record<SupportInvoicePaymentStatus, BadgeTone>> = {
  pending: 'info',
  overdue: 'danger',
  paid: 'success',
};

export function SupportInvoicePaymentStatusBadge({ status }: { status: SupportInvoicePaymentStatus | null }) {
  if (!status) return null;
  return <Badge tone={PAYMENT_TONE[status]}>{SUPPORT_INVOICE_PAYMENT_STATUS_LABELS[status]}</Badge>;
}
