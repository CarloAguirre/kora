import styles from './PendingApprovalsCard.module.css';
import { Card } from '@/shared/components/ui/Card';
import { useProjectPendingApprovals } from '@/modules/hours/api/hours.queries';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL');

export interface PendingApprovalsCardProps {
  readonly projectId: string;
  /** Solo el líder del proyecto (o admin/pmo) puede ver este resumen — ver `GetProjectPendingApprovalsUseCase`. */
  readonly visible: boolean;
}

/**
 * Desde que la aprobación de horas de proyecto pasó a ser EXCLUYENTE del
 * líder de equipo (ver docs/DECISION-M4-HORAS.md), el líder de proyecto ya
 * no puede aprobar directamente las horas que le tocan a un líder de equipo
 * — esta tarjeta es cómo se entera de que están ahí y con quién, sin poder
 * decidir sobre ellas desde acá.
 */
export function PendingApprovalsCard({ projectId, visible }: PendingApprovalsCardProps) {
  const { data } = useProjectPendingApprovals(projectId, visible);

  if (!visible || !data) return null;

  return (
    <Card>
      <p className={styles.title}>Pendiente con líderes de equipo</p>
      <p className={styles.hint}>Horas de este proyecto que solo puede aprobar el líder de cada equipo.</p>

      {data.groups.length === 0 ? (
        <p className={styles.empty}>No hay horas pendientes con líderes de equipo en este momento.</p>
      ) : (
        <div className={styles.list}>
          {data.groups.map((group) => (
            <div key={group.approverUserId} className={styles.row}>
              <span className={styles.approverName}>{group.approverName}</span>
              <span className={styles.meta}>
                {group.entryCount} registro{group.entryCount === 1 ? '' : 's'} · {formatHours(group.totalHours)} HH · pendiente
                desde el {formatDate(group.oldestPendingDate)}
              </span>

              <div className={styles.collaborators}>
                {group.collaborators.map((collaborator) => (
                  <div key={collaborator.userId} className={styles.collaboratorRow}>
                    <span>{collaborator.userName}</span>
                    <span className={styles.meta}>
                      {formatHours(collaborator.totalHours)} HH ({collaborator.entryCount}) desde el{' '}
                      {formatDate(collaborator.oldestPendingDate)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
