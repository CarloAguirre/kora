import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import styles from './Toast.module.css';
import { AlertIcon, CheckIcon, CloseIcon } from '../icons/Icons';

/**
 * Avisos efímeros.
 *
 * El contenedor va en `aria-live="polite"`, así que un lector de pantalla
 * anuncia el mensaje sin interrumpir lo que la persona esté haciendo. Un aviso
 * puramente visual deja fuera a quien no ve la pantalla — y "se guardó el
 * usuario" es justo la clase de confirmación que todo el mundo necesita.
 */

export type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  readonly id: number;
  readonly tone: ToastTone;
  readonly message: string;
}

interface ToastContextValue {
  show(message: string, tone?: ToastTone): void;
  success(message: string): void;
  error(message: string): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      nextId.current += 1;
      const id = nextId.current;

      setToasts((current) => [...current, { id, tone, message }]);
      // Los errores también se cierran solos, pero quedan más tiempo: hay que
      // leerlos, no solo verlos pasar.
      setTimeout(() => dismiss(id), tone === 'error' ? AUTO_DISMISS_MS * 2 : AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (message: string) => show(message, 'success'),
      error: (message: string) => show(message, 'error'),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className={styles.container} aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={[styles.toast, toast.tone !== 'info' ? styles[toast.tone] : '']
              .filter(Boolean)
              .join(' ')}
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            <span className={styles.icon} aria-hidden="true">
              {toast.tone === 'error' ? <AlertIcon size={18} /> : <CheckIcon size={18} />}
            </span>

            <span className={styles.message}>{toast.message}</span>

            <button
              type="button"
              className={styles.dismiss}
              onClick={() => dismiss(toast.id)}
              aria-label="Cerrar aviso"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast debe usarse dentro de <ToastProvider>.');
  }

  return context;
}
