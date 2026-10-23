import type { ClientCompanyInfo } from '../types';
import { BuildingIcon } from '@/shared/components/icons/Icons';
import { KabeliLogo } from '@/shared/components/layout/KabeliLogo';
import styles from './ClientCompanyHeader.module.css';

/**
 * Franja "empresa" que encabeza el portal — nombre, contacto y logo de marca.
 *
 * El Figma de referencia muestra el logo real del cliente y el wordmark
 * "kabeli" a la derecha. El logo se carga en "Editar cliente"; si el cliente
 * no tiene uno, queda un ícono neutro en su lugar. La marca es `KabeliLogo`,
 * igual que en la ficha de proyecto del portal (`ClientProjectDetailPage`).
 */
export function ClientCompanyHeader({
  company,
  contractLabel,
  nameSuffix,
}: {
  company: ClientCompanyInfo;
  contractLabel: string;
  /** Texto tras el nombre ("Vista cliente" en la vista previa de admin). */
  nameSuffix?: string;
}) {
  return (
    <div className={styles.row}>
      <div className={styles.identity}>
        {company.logoUrl ? (
          <img className={styles.logo} src={company.logoUrl} alt={`Logo de ${company.name}`} />
        ) : (
          <div className={styles.logoPlaceholder} aria-hidden="true">
            <BuildingIcon size={28} />
          </div>
        )}
        <div className={styles.text}>
          <span className={styles.name}>
            {company.name}
            {nameSuffix && ` — ${nameSuffix}`}
          </span>
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
