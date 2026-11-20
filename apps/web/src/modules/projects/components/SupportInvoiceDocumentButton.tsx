import { supportPlanApi } from '../api/support-plan.api';
import { useUploadSupportInvoiceAttachment } from '../api/support-plan.queries';
import { InvoiceDocumentButton } from './InvoiceDocumentButton';

interface Props {
  invoiceId: string;
  hasAttachment?: boolean;
  canManageBilling: boolean;
  folio?: string;
}

export function SupportInvoiceDocumentButton({ invoiceId, ...props }: Props) {
  const upload = useUploadSupportInvoiceAttachment();
  return <InvoiceDocumentButton
    {...props}
    load={() => supportPlanApi.invoiceAttachment(invoiceId)}
    upload={(file) => upload.mutateAsync({ invoiceId, file })}
    uploading={upload.isPending}
  />;
}
