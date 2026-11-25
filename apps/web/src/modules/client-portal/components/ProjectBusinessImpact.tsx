import type { ComponentType } from 'react';
import {
  CalendarIcon, ClockIcon, LockIcon, UnlockIcon, UsersIcon,
  type IconProps,
} from '@/shared/components/icons/Icons';
import type { ClientBusinessImpact } from '../adapters/business-impact.adapter';
import styles from '../pages/ClientProjectDetailPage.module.css';

function ImpactStat({
  icon: Icon, iconTone, label, value, last = false,
}: {
  icon: ComponentType<IconProps>;
  iconTone: 'before' | 'after';
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div className={[styles.impactStat, last ? styles.impactStatLast : ''].filter(Boolean).join(' ')}>
      <span className={[styles.impactIcon, iconTone === 'after' ? styles.impactIconAfter : ''].filter(Boolean).join(' ')}>
        <Icon size={14} />
      </span>
      <span className={styles.impactLabel}>{label}</span>
      <span className={styles.impactValue}>{value}</span>
    </div>
  );
}

/** Tarjeta de Impacto del negocio de la Vista Cliente de PMO, reutilizada
 * sin variantes visuales por el portal externo. No consulta APIs; ambas
 * rutas suministran los mismos campos de proyectos, con su autorización. */
export function ProjectBusinessImpact({ impact }: { readonly impact: ClientBusinessImpact }) {
  const { before, after, reductionPercent } = impact;
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeadingRow}>
        <h3 className={styles.sectionTitle}>Impacto en el negocio</h3>
        <span className={styles.sectionCaption}>Proceso manual vs. proceso con automatizado</span>
      </div>
      <div className={styles.impactCard}>
        <div className={styles.impactColumn}>
          <span className={styles.impactHeading}>Antes de automatizar</span>
          <ImpactStat icon={ClockIcon} iconTone="before" label="Tiempo total del proceso" value={`${before.totalProcessHours} horas`} />
          <ImpactStat icon={UsersIcon} iconTone="before" label="Personas involucradas" value={`${before.peopleInvolved} personas`} />
          <ImpactStat icon={CalendarIcon} iconTone="before" label="Duración calendario" value={`${before.cycleDays} días laborales (8h c/u)`} />
          <ImpactStat icon={LockIcon} iconTone="before" label="Modalidad" value={before.modality} last />
        </div>
        <div className={styles.impactColumn}>
          <span className={styles.impactHeading}>Después — medido en QA / Marcha blanca</span>
          <ImpactStat icon={ClockIcon} iconTone="after" label="Tiempo total del proceso" value={`${after.totalProcessHours} horas`} />
          <ImpactStat
            icon={UsersIcon} iconTone="after"
            label="Personas involucradas"
            value={after.peopleInvolved === 0 ? '0 personas · solo supervisión' : `${after.peopleInvolved} personas`}
          />
          <ImpactStat icon={CalendarIcon} iconTone="after" label="Duración calendario" value={after.cycleDays === 0 ? 'Mismo día' : `${after.cycleDays} días`} />
          <ImpactStat icon={UnlockIcon} iconTone="after" label="Modalidad" value={after.modality} last />
        </div>
        <div className={styles.impactCallout}>
          <p className={styles.impactCalloutValue}>-{reductionPercent}%</p>
          <p className={styles.impactCalloutCaption}>reducción de tiempo de proceso</p>
        </div>
      </div>
    </section>
  );
}
