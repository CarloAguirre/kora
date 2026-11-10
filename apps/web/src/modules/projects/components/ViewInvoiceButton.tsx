import { useState } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';

export function ViewInvoiceButton({ load, folio }: { load: () => Promise<Blob>; folio?: string }) {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const open = async () => {
    // Abrir antes de esperar la API evita el bloqueo de ventanas emergentes.
    const tab = window.open('about:blank', '_blank');
    if (!tab) {
      toast.error('El navegador bloqueó la pestaña. Permite ventanas emergentes para ver la factura.');
      return;
    }
    tab.opener = null;
    setLoading(true);
    try {
      const file = await load();
      const url = URL.createObjectURL(file);
      if (tab.closed) {
        URL.revokeObjectURL(url);
      } else {
        tab.location.replace(url);
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (error) {
      tab.close();
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo abrir la factura. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" loading={loading} onClick={() => void open()}>
      Ver factura{folio ? ` ${folio}` : ''}
    </Button>
  );
}
