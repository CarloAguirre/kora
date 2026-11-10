import { useRef } from 'react';
import { MAX_SUPPORT_INVOICE_PDF_BYTES, MAX_PAYMENT_RECEIPT_BYTES, PAYMENT_RECEIPT_MIME_TYPES } from '@kora/contracts';
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
  receipt?: boolean;
}

export function InvoiceDocumentButton({ load, upload, uploading, hasAttachment, canManageBilling, folio, receipt = false }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const submit = async (file: File) => {
    const validType = receipt ? PAYMENT_RECEIPT_MIME_TYPES.some((type) => type === file.type) : file.type === 'application/pdf';
    if (!validType || file.size > (receipt ? MAX_PAYMENT_RECEIPT_BYTES : MAX_SUPPORT_INVOICE_PDF_BYTES)) {
      toast.error(receipt ? 'Adjunta un PDF o imagen JPG/PNG de hasta 5 MB.' : 'Adjunta un archivo PDF de hasta 5 MB.');
      return;
    }
    try {
      await upload(file);
      toast.success(receipt ? 'Comprobante adjuntado al pago.' : 'Documento adjuntado a la factura.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : `No se pudo subir el ${receipt ? 'comprobante' : 'documento'}. Inténtalo de nuevo.`);
    }
  };

  if (hasAttachment) return <ViewInvoiceButton load={load} folio={folio} receipt={receipt} />;
  if (!canManageBilling) return null;

  const label = `${receipt ? 'Subir comprobante' : 'Subir documento'}${folio ? ` ${folio}` : ''}`;
  return (
    <>
      <Button variant="outline" size="sm" loading={uploading} loadingText="Subiendo..." onClick={() => input.current?.click()}>
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept={receipt ? PAYMENT_RECEIPT_MIME_TYPES.join(',') : 'application/pdf'}
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
