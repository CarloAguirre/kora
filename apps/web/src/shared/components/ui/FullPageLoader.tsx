import styles from './FullPageLoader.module.css';

/** Pantalla de espera a página completa, para el arranque de la aplicación. */
export function FullPageLoader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className={styles.wrapper} role="status" aria-live="polite">
      <div className={styles.spinner} aria-hidden="true" />
      <p className={styles.label}>{label}</p>
    </div>
  );
}
