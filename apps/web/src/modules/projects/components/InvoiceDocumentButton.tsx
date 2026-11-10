import { useRef } from 'react';
import { MAX_SUPPORT_INVOICE_PDF_BYTES } from '@kora/contracts';
import { Button } from '@/shared/components/ui/Button';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';
import { ViewInvoiceButton } from './ViewInvoiceButton';

interface Props {
  load: () => Promise<Blob>;
  upload: (file: File) => Promise<unknown>;
  uploading: boolean;
  hasAttachment?: boolean;
  canManageBilling: boolean;
  folio?: string;
}

export function InvoiceDocumentButton({ load, upload, uploading, hasAttachment, canManageBilling, folio }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const submit = async (file: File) => {
    if (file.type !== 'application/pdf' || file.size > MAX_SUPPORT_INVOICE_PDF_BYTES) {
      toast.error('Adjunta un archivo PDF de hasta 5 MB.');
      return;
    }
    try {
      await upload(file);
      toast.success('Documento adjuntado a la factura.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo subir el documento. Inténtalo de nuevo.');
    }
  };

  if (hasAttachment) return <ViewInvoiceButton load={load} folio={folio} />;
  if (!canManageBilling) return null;

  const label = `Subir documento${folio ? ` ${folio}` : ''}`;
  return (
    <>
      <Button variant="outline" size="sm" loading={uploading} loadingText="Subiendo..." onClick={() => input.current?.click()}>
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept="application/pdf"
        aria-label={label}
        hidden
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void submit(file);
        }}
      />
    </>
  );
}
