import { supportPlanApi } from '../api/support-plan.api';
import { ViewInvoiceButton } from './ViewInvoiceButton';

export function ViewSupportInvoiceButton({ invoiceId, folio }: { invoiceId: string; folio?: string }) {
  return <ViewInvoiceButton load={() => supportPlanApi.invoiceAttachment(invoiceId)} folio={folio} />;
}
