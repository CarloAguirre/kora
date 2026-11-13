import { projectsApi } from '../api/projects.api';
import { useUploadProjectInvoiceAttachment } from '../api/projects.queries';
import { InvoiceDocumentButton } from './InvoiceDocumentButton';

interface Props {
  projectId: string;
  milestoneId: string;
  hasAttachment?: boolean;
  canManageBilling: boolean;
}

export function ProjectInvoiceDocumentButton({ projectId, milestoneId, ...props }: Props) {
  const upload = useUploadProjectInvoiceAttachment();
  return <InvoiceDocumentButton
    {...props}
    load={() => projectsApi.invoiceAttachment(projectId, milestoneId)}
    upload={(file) => upload.mutateAsync({ projectId, milestoneId, file })}
    uploading={upload.isPending}
  />;
}
