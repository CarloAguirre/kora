import { projectsApi } from '../api/projects.api';
import { useUploadProjectPaymentReceipt } from '../api/projects.queries';
import { InvoiceDocumentButton } from './InvoiceDocumentButton';

interface Props {
  projectId: string;
  milestoneId: string;
  hasPaymentReceipt?: boolean;
  canManageBilling: boolean;
}

export function ProjectPaymentReceiptButton({ projectId, milestoneId, hasPaymentReceipt, canManageBilling }: Props) {
  const upload = useUploadProjectPaymentReceipt();
  return <InvoiceDocumentButton
    receipt
    hasAttachment={hasPaymentReceipt}
    canManageBilling={canManageBilling}
    load={() => projectsApi.paymentReceipt(projectId, milestoneId)}
    upload={(file) => upload.mutateAsync({ projectId, milestoneId, file })}
    uploading={upload.isPending}
  />;
}
