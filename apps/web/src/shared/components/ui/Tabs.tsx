import styles from './Tabs.module.css';

export interface TabItem {
  readonly id: string;
  readonly label: string;
}

interface TabsProps {
  tabs: readonly TabItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

/** Pestañas de sección, igual disposición que `KoraTabs.tsx` de la v1. */
export function Tabs({ tabs, activeId, onSelect }: TabsProps) {
  return (
    <div className={styles.tabs} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeId}
          className={[styles.tab, tab.id === activeId ? styles.active : ''].filter(Boolean).join(' ')}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
