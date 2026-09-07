import styles from './StatPill.module.css';

export interface StatPillProps {
  value: number | string;
  label: string;
  /** Cuando se pasa `onClick`, la píldora actúa como filtro (tab Soporte); si no, es solo un dato (tab Proyectos). */
  onClick?: () => void;
  active?: boolean;
}

/** Cifra + etiqueta en una píldora — resumen "3 proyectos totales" / filtro "Ver todos" del Figma. */
export function StatPill({ value, label, onClick, active = false }: StatPillProps) {
  const content = (
    <>
      <span className={styles.value}>{value}</span>
      <span className={styles.label}>{label}</span>
    </>
  );

  if (!onClick) {
    return <div className={styles.pill}>{content}</div>;
  }

  return (
    <button
      type="button"
      className={[styles.pill, styles.clickable, active ? styles.active : ''].filter(Boolean).join(' ')}
      onClick={onClick}
      aria-pressed={active}
    >
      {content}
    </button>
  );
}
