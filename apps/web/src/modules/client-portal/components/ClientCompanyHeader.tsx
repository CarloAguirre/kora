import type { ClientCompanyInfo } from '../types';
import { BuildingIcon } from '@/shared/components/icons/Icons';
import { KoraLogo } from '@/shared/components/layout/KoraLogo';
import styles from './ClientCompanyHeader.module.css';

/**
 * Franja "empresa" que encabeza el portal — nombre, contacto y logo de marca.
 *
 * El Figma de referencia muestra el logo real del cliente y el wordmark
 * "kabeli" a la derecha. No hay assets de logo por cliente en este proyecto
 * (ni un componente de marca "Kabeli" — el resto de la app ya usa el logo de
 * Kora para esa misma mención, ver el pie de `DashboardSupportTab.tsx`), así
 * que aquí se usa un ícono neutro como marcador de posición del logo del
 * cliente y se reutiliza `KoraLogo` para la marca, en vez de inventar un
 * asset nuevo.
 */
export function ClientCompanyHeader({ company, contractLabel }: { company: ClientCompanyInfo; contractLabel: string }) {
  return (
    <div className={styles.row}>
      <div className={styles.identity}>
        <div className={styles.logoPlaceholder} aria-hidden="true">
          <BuildingIcon size={28} />
        </div>
        <div className={styles.text}>
          <span className={styles.name}>{company.name}</span>
          <span className={styles.contact}>
            <strong>{contractLabel}</strong>: {company.contactName} — {company.contactPosition}
          </span>
        </div>
      </div>

      <div className={styles.brand}>
        <KoraLogo variant="dark" />
      </div>
    </div>
  );
}
