import { Link } from 'react-router-dom';
import styles from './ProjectViewTabs.module.css';
import { LockIcon } from '@/shared/components/icons/Icons';

export type ProjectView = 'internal' | 'client';

interface ProjectViewTabsProps {
  readonly active: ProjectView;
  /** Destino de "Vista Interna". Sin él (portal real del cliente) la pestaña
   *  queda deshabilitada con candado, igual que en el Figma. */
  readonly internalTo?: string;
  readonly clientTo?: string;
}

/**
 * Pestañas "Vista Interna" / "Vista Cliente" (Figma node 9203:3136) — cambian
 * la ficha completa, por eso van como primer elemento de la página tanto en
 * `ProjectDetailPage` como en `ClientProjectDetailPage`: así quedan en la
 * misma posición al alternar entre una y otra.
 */
export function ProjectViewTabs({ active, internalTo, clientTo }: ProjectViewTabsProps) {
  return (
    <div className={styles.viewTabs} role="tablist" aria-label="Vista de la ficha">
      <ViewTab active={active === 'internal'} to={internalTo} locked={!internalTo}>
        Vista Interna
      </ViewTab>
      <ViewTab active={active === 'client'} to={clientTo} locked={false}>
        Vista Cliente
      </ViewTab>
    </div>
  );
}

function ViewTab({ active, to, locked, children }: { active: boolean; to?: string; locked: boolean; children: string }) {
  if (active) {
    return (
      <span className={styles.viewTabActive} role="tab" aria-selected={true}>
        {children}
      </span>
    );
  }
  if (!to) {
    return (
      <span
        className={styles.viewTabDisabled}
        role="tab"
        aria-selected={false}
        aria-disabled
        title={locked ? 'Solo el equipo Kabeli puede ver esta pestaña' : undefined}
      >
        {locked && <LockIcon size={13} />}
        {children}
      </span>
    );
  }
  return (
    <Link className={styles.viewTab} role="tab" aria-selected={false} to={to}>
      {children}
    </Link>
  );
}
