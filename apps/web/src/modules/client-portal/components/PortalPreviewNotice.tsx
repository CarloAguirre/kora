import type { ReactNode } from 'react';
import styles from './PortalPreviewNotice.module.css';
import { EyeIcon } from '@/shared/components/icons/Icons';

/** Aviso mostrado cuando un admin/PMO entra al portal de cliente en modo
 *  "Ver como cliente" desde `ClientDetailPage` — ver `docs/DECISION-PORTAL-CLIENTE.md`. */
export function PortalPreviewNotice({ children }: { children: ReactNode }) {
  return (
    <div className={styles.notice} role="note">
      <EyeIcon size={15} />
      <span>{children}</span>
    </div>
  );
}
