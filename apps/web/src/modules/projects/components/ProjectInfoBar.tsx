import type { ReactNode } from 'react';
import type { ProjectPhase, ProjectSalesStage, ProjectStatus } from '@kora/contracts';
import { PROJECT_SALES_STAGE_LABELS } from '@kora/contracts';
import { Badge } from '@/shared/components/ui/Badge';
import {
  BuildingIcon,
  CalendarIcon,
  CheckIcon,
  FolderOpenIcon,
  PaperclipIcon,
  TrendingUpIcon,
  UserIcon,
} from '@/shared/components/icons/Icons';
import { ProjectStatusBadge } from './ProjectStatusBadge';
import { ProjectPhaseBadge } from './ProjectPhaseBadge';
import styles from './ProjectInfoBar.module.css';

export interface ProjectDocument {
  readonly label: string;
  readonly url: string;
}

/**
 * Barra compacta de datos del proyecto — réplica de la cabecera de
 * `LiderProyectoFicha` (v1): una fila de ítems ícono + etiqueta + valor, en
 * vez de la grilla de pares label/value de la v2 original.
 */
export function ProjectInfoBar({
  clientName,
  leaderName,
  dateRange,
  salesStage,
  status,
  phase,
  documents,
}: {
  clientName: string;
  leaderName: string;
  dateRange: string;
  salesStage: ProjectSalesStage | null;
  status: ProjectStatus;
  phase: ProjectPhase | null;
  documents: readonly ProjectDocument[];
}) {
  return (
    <div className={styles.bar}>
      <InfoItem icon={<BuildingIcon size={16} />} label="Cliente" value={clientName} />
      <InfoItem icon={<UserIcon size={16} />} label="Líder - PM Responsable" value={leaderName} />
      <InfoItem icon={<CalendarIcon size={16} />} label="Fecha de inicio - fin" value={dateRange} />
      <InfoItem
        icon={<TrendingUpIcon size={16} />}
        label="Tipo del proyecto"
        value={<Badge tone="info">{salesStage ? PROJECT_SALES_STAGE_LABELS[salesStage] : 'Sin definir'}</Badge>}
      />
      <InfoItem icon={<CheckIcon size={16} />} label="Estado del proyecto" value={<ProjectStatusBadge status={status} />} />
      <InfoItem icon={<FolderOpenIcon size={16} />} label="Etapa de avance" value={<ProjectPhaseBadge phase={phase} />} />
      <InfoItem
        icon={<PaperclipIcon size={16} />}
        label="Documentos"
        value={
          documents.length === 0 ? (
            'Sin documentos adjuntos'
          ) : (
            <span className={styles.badgeRow}>
              {documents.map((doc) => (
                <a key={doc.label} href={doc.url} target="_blank" rel="noreferrer" className={styles.docsLink}>
                  {doc.label}
                </a>
              ))}
            </span>
          )
        }
      />
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className={styles.item}>
      <span className={styles.iconWrap}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <p className={styles.label}>{label}</p>
        <p className={styles.value}>{value}</p>
      </div>
    </div>
  );
}
