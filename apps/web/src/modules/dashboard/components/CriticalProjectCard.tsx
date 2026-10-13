import { Link } from 'react-router-dom';
import type { DashboardCriticalProject } from '@kora/contracts';
import styles from './CriticalProjectCard.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { UsersIcon } from '@/shared/components/icons/Icons';
import { projectPath } from '@/app/router/paths';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

/** Tarjeta del "Monitor de Salud Proyectos Críticos", igual disposición que `DashboardProyectos` en la v1. */
export function CriticalProjectCard({ project }: { project: DashboardCriticalProject }) {
  const consumptionPercent = project.soldHours > 0 ? Math.round((project.usedHours / project.soldHours) * 100) : 0;
  const hasPlan = project.actualProgress != null && project.expectedProgress != null;

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <span className={styles.name}>{project.name}</span>
      </div>

      <div className={styles.leader}>
        <UsersIcon size={16} />
        <span>{project.leaderFullName ?? 'Sin líder'}</span>
      </div>

      <div className={styles.metric}>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>HH consumidas</span>
          <span className={styles.metricValue}>
            {formatHours(project.usedHours)}/{formatHours(project.soldHours)}
          </span>
        </div>
        <div className={styles.track}>
          <div
            className={[styles.fill, project.status === 'critical' ? styles.fillCritical : styles.fillAlert].join(' ')}
            style={{ width: `${Math.min(consumptionPercent, 100)}%` }}
          />
        </div>
      </div>

      <div className={styles.metricRow}>
        <span className={styles.metricLabel}>HH Planificación</span>
        <span className={styles.metricValue}>{formatHours(project.planningHours)}</span>
      </div>

      <div className={styles.metric}>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>Avance Real vs Esperado</span>
          <span className={styles.metricValue}>
            {hasPlan ? `Real: ${project.actualProgress}% · Esperado: ${project.expectedProgress}%` : 'Sin plan cargado'}
          </span>
        </div>
        {/* Relleno = avance real; la marca = dónde debería ir hoy. */}
        <div className={styles.track}>
          {hasPlan && (
            <>
              <div className={styles.fillProgress} style={{ width: `${Math.min(project.actualProgress ?? 0, 100)}%` }} />
              <span className={styles.expectedMark} style={{ left: `${Math.min(project.expectedProgress ?? 0, 100)}%` }} />
            </>
          )}
        </div>
      </div>

      <div className={styles.badges}>
        <Badge tone={project.status === 'critical' ? 'danger' : 'warning'}>
          Estado: {project.status === 'critical' ? 'Crítico' : 'Alerta'}
        </Badge>
        <Badge tone="neutral">Etapa: {project.stageLabel}</Badge>
      </div>

      <Link to={projectPath(project)} className={styles.link}>
        <Button variant="tertiary" className={styles.linkButton}>
          Ver detalle
        </Button>
      </Link>
    </Card>
  );
}
