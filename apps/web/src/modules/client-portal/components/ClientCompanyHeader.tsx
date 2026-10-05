import type { ClientCompanyInfo } from '../types';
import { BuildingIcon } from '@/shared/components/icons/Icons';
import { KabeliLogo } from '@/shared/components/layout/KabeliLogo';
import styles from './ClientCompanyHeader.module.css';

/**
 * Franja "empresa" que encabeza el portal — nombre, contacto y logo de marca.
 *
 * El Figma de referencia muestra el logo real del cliente y el wordmark
 * "kabeli" a la derecha. No hay assets de logo por cliente en este proyecto,
 * así que se usa un ícono neutro como marcador de posición del logo del
 * cliente; la marca es `KabeliLogo`, igual que en la ficha de proyecto del
 * portal (`ClientProjectDetailPage`).
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
        <KabeliLogo />
      </div>
    </div>
  );
}
