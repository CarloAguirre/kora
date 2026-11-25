import { useCallback, useRef, useState } from 'react';
import { ConfirmActionDialog } from './ConfirmActionDialog';

export type ConfirmationRequest = {
  title: string;
  description: string;
  warning?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'secondary' | 'danger';
  destructive?: boolean;
};
type Pending = ConfirmationRequest & { resolve: (confirmed: boolean) => void };

/** Confirmación Kora en lugar de window.confirm. No ejecuta acciones al confirmar:
 * la promesa entrega una decisión; el llamador conserva su propio control de errores. */
export function useConfirmAction() {
  const [pending, setPending] = useState<Pending | null>(null);
  const current = useRef<Pending | null>(null);
  const confirm = useCallback((request: ConfirmationRequest): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      // No abrir un segundo diálogo encima del primero.
      if (current.current) { resolve(false); return; }
      const item = { ...request, resolve };
      current.current = item;
      setPending(item);
    }), []);

  const finish = (answer: boolean, expected: Pending | null) => {
    // ConfirmActionDialog llama onClose DESPUÉS de await onConfirm().
    // Si el caller encadena dos confirmaciones, el primer onClose puede
    // llegar cuando ya está abierta la segunda. Nunca cancelar otra solicitud.
    const item = current.current;
    if (!item || !expected || item !== expected) return;
    current.current = null;
    setPending(null);
    item.resolve(answer);
  };
  return {
    confirm,
    dialog: (
      <ConfirmActionDialog
        open={pending !== null}
        title={pending?.title ?? 'Confirmar acción'}
        description={pending?.description ?? ''}
        warning={pending?.warning}
        confirmLabel={pending?.confirmLabel ?? 'Confirmar'}
        cancelLabel={pending?.cancelLabel}
        confirmVariant={pending?.confirmVariant}
        destructive={pending?.destructive}
        onConfirm={async () => finish(true, pending)}
        onClose={() => finish(false, pending)}
      />
    ),
  };
}
