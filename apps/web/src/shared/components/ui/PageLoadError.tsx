import styles from './PageLoadError.module.css';
import { Button } from './Button';
import { ChevronLeftIcon } from '@/shared/components/icons/Icons';
import { ApiRequestError } from '@/shared/lib/api-client';

export interface PageLoadErrorProps {
  /** Error de la query principal de la página de detalle. */
  error: unknown;
  /** Ej. "este proyecto" — arma "No tienes acceso a este proyecto." / "No se pudo cargar este proyecto.". */
  subject: string;
  backLabel: string;
  onBack: () => void;
}

/**
 * Lo que muestra una página de detalle cuando su query principal falla — en
 * particular al entrar por URL a algo para lo que no se tiene permiso (403).
 * Sin esto, la página se quedaba en "Cargando…" para siempre: los 4xx no se
 * reintentan (ver `App.tsx`) y `data` nunca llega.
 */
export function PageLoadError({ error, subject, backLabel, onBack }: PageLoadErrorProps) {
  const status = error instanceof ApiRequestError ? error.status : null;
  const message =
    status === 403 ? `No tienes acceso a ${subject}.` : status === 404 ? `No se encontró ${subject}.` : `No se pudo cargar ${subject}.`;

  return (
    <div className={styles.wrapper}>
      <Button variant="tertiary" size="sm" className={styles.backButton} onClick={onBack}>
        <ChevronLeftIcon size={16} /> {backLabel}
      </Button>
      <p role="alert">{message}</p>
    </div>
  );
}
