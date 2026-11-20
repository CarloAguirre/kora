import { useId, useRef } from 'react';
import styles from './FileField.module.css';
import { PaperclipIcon } from '../icons/Icons';

export interface FileFieldProps {
  label?: string;
  /** Nombre del archivo ya elegido. */
  fileName: string | null;
  /** Entrega el nombre y, para quien necesite leer el contenido (p. ej. el logo del cliente), el archivo en sí. */
  onChange: (fileName: string | null, file: File | null) => void;
  accept?: string;
  disabled?: boolean;
}

/**
 * Selector de archivo con la misma apariencia que el resto de los campos
 * (`TextField`/`Select`) — el `<input type="file">` nativo no se puede
 * estilizar directamente (su botón "Seleccionar archivo" ignora el CSS), así
 * que queda oculto y este botón lo activa por código.
 */
export function FileField({ label, fileName, onChange, accept, disabled }: FileFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className={styles.wrapper}>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className={[styles.field, disabled ? styles.disabled : ''].filter(Boolean).join(' ')}>
        <button
          type="button"
          className={styles.trigger}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <PaperclipIcon size={14} />
          Seleccionar archivo
        </button>
        <span className={[styles.fileName, fileName ? '' : styles.placeholder].filter(Boolean).join(' ')}>
          {fileName ?? 'Ningún archivo seleccionado'}
        </span>
        <input
          ref={inputRef}
          id={inputId}
          className={styles.hiddenInput}
          type="file"
          accept={accept}
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            onChange(file?.name ?? null, file);
            // Sin esto, volver a elegir el mismo archivo no dispara `change`.
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
