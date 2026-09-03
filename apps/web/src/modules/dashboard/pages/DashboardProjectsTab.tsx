import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { DashboardCapacitySummary, DashboardProjectsSummary } from '@kora/contracts';
import styles from './DashboardProjectsTab.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { useToast } from '@/shared/components/ui/Toast';
import { PlusIcon, AlertIcon, ChevronRightIcon } from '@/shared/components/icons/Icons';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { ClientFormDialog } from '@/modules/clients/components/ClientFormDialog';
import { SegmentedBar } from '@/shared/components/ui/SegmentedBar';
import { CriticalProjectCard } from '../components/CriticalProjectCard';
import { CapacityPlanningSection } from '../components/CapacityPlanningSection';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

/** Mismos colores de estado (danger/warning/success) que usa el resto del dashboard — nunca un color nuevo para "salud". */
const HEALTH_COLORS = { critical: '#c50000', alert: '#ee7e23', optimal: '#4fae32' } as const;

interface DashboardProjectsTabProps {
  projects: DashboardProjectsSummary | null;
  capacity: DashboardCapacitySummary | null;
  loading: boolean;
  weekStart: string | undefined;
  onWeekStartChange: (weekStart: string) => void;
}

/** Tab "Proyectos" del Dashboard — igual disposición que `DashboardProyectos` en la v1. Sin el enlace "Ver forecast detallado": Forecast ya vive en el menú lateral. */
export function DashboardProjectsTab({ projects, capacity, loading, weekStart, onWeekStartChange }: DashboardProjectsTabProps) {
  const { can } = usePermissions();
  const navigate = useNavigate();
  const toast = useToast();
  const [createClientOpen, setCreateClientOpen] = useState(false);

  return (
    <div className={styles.tab}>
      <div className={styles.actions}>
        {can('projects:manage') && (
          <Link to="/proyectos/nuevo">
            <Button iconLeft={<PlusIcon size={16} />}>Crear Proyecto</Button>
          </Link>
        )}
        {can('clients:manage') && (
          <Button variant="secondary" iconLeft={<PlusIcon size={16} />} onClick={() => setCreateClientOpen(true)}>
            Crear Cliente
          </Button>
        )}
      </div>

      <div className={styles.kpis}>
        <Card className={styles.kpiCard}>
          <div className={styles.kpiLabelRow}>
            <span className={styles.kpiLabel}>{projects?.scope === 'own' ? 'Mis Proyectos Activos' : 'Proyectos Activos'}</span>
            <Button variant="ghost" size="icon" aria-label="Ir a Proyectos" onClick={() => navigate('/proyectos')}>
              <ChevronRightIcon size={16} />
            </Button>
          </div>
          <span className={[styles.kpiValue, styles.kpiValueInfo].join(' ')}>{loading ? '…' : (projects?.activeCount ?? 0)}</span>
          {!!projects && (
            <>
              <SegmentedBar
                segments={[
                  { key: 'critical', value: projects.healthBreakdown.critical, color: HEALTH_COLORS.critical, label: 'Crítico' },
                  { key: 'alert', value: projects.healthBreakdown.alert, color: HEALTH_COLORS.alert, label: 'En alerta' },
                  { key: 'optimal', value: projects.healthBreakdown.optimal, color: HEALTH_COLORS.optimal, label: 'Óptimo' },
                ]}
              />
              <div className={styles.kpiBreakdown}>
                {projects.healthBreakdown.critical > 0 && (
                  <span className={styles.kpiBreakdownItem}>
                    <span className={styles.kpiDot} style={{ background: HEALTH_COLORS.critical }} />
                    {projects.healthBreakdown.critical} crítico{projects.healthBreakdown.critical === 1 ? '' : 's'}
                  </span>
                )}
                {projects.healthBreakdown.alert > 0 && (
                  <span className={styles.kpiBreakdownItem}>
                    <span className={styles.kpiDot} style={{ background: HEALTH_COLORS.alert }} />
                    {projects.healthBreakdown.alert} en alerta
                  </span>
                )}
                {projects.healthBreakdown.optimal > 0 && (
                  <span className={styles.kpiBreakdownItem}>
                    <span className={styles.kpiDot} style={{ background: HEALTH_COLORS.optimal }} />
                    {projects.healthBreakdown.optimal} óptimo{projects.healthBreakdown.optimal === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </>
          )}
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiLabelRow}>
            <div className={styles.kpiLabelGroup}>
              <AlertIcon size={16} />
              <span className={styles.kpiLabel}>Alertas de Desvío</span>
            </div>
            <Button variant="ghost" size="icon" aria-label="Ir a Proyectos" onClick={() => navigate('/proyectos')}>
              <ChevronRightIcon size={16} />
            </Button>
          </div>
          <span className={[styles.kpiValue, styles.kpiValueDanger].join(' ')}>
            {loading ? '…' : `${formatHours(projects?.deviationHoursTotal ?? 0)} hrs.`}
          </span>
          <span className={styles.kpiSub}>{projects?.deviationAlertsCount ?? 0} proyectos con horas desviadas</span>
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiLabelRow}>
            <span className={styles.kpiLabel}>Prospecto y Cotización</span>
            <Button variant="ghost" size="icon" aria-label="Ir a Proyectos" onClick={() => navigate('/proyectos')}>
              <ChevronRightIcon size={16} />
            </Button>
          </div>
          <span className={[styles.kpiValue, styles.kpiValueBrand].join(' ')}>
            {loading ? '…' : (projects?.prospectCount ?? 0) + (projects?.quotationCount ?? 0)}
          </span>
          <span className={styles.kpiSub}>
            {projects?.prospectCount ?? 0} Proyectos en prospecto / {projects?.quotationCount ?? 0} en Cotización
          </span>
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiLabelRow}>
            <span className={styles.kpiLabel}>Cierre de proyectos</span>
            <Button variant="ghost" size="icon" aria-label="Ir a Proyectos" onClick={() => navigate('/proyectos')}>
              <ChevronRightIcon size={16} />
            </Button>
          </div>
          <span className={styles.kpiValueClosing}>{loading ? '…' : `${projects?.finishedCount ?? 0} proyectos finalizados`}</span>
          <span className={styles.kpiSubWarning}>+{projects?.closingThisMonthCount ?? 0} por finalizar este mes</span>
        </Card>
      </div>

      <div className={styles.monitor}>
        <div className={styles.monitorHeader}>
          <span className={styles.monitorTitle}>Monitor de Salud Proyectos Críticos</span>
          <Button variant="tertiary" onClick={() => navigate('/proyectos')}>
            Ver más
          </Button>
        </div>

        <div className={styles.monitorList}>
          {loading ? (
            <span className={styles.empty}>Cargando proyectos...</span>
          ) : !projects || projects.criticalProjects.length === 0 ? (
            <span className={styles.empty}>No hay proyectos críticos en este momento</span>
          ) : (
            projects.criticalProjects.map((project) => <CriticalProjectCard key={project.id} project={project} />)
          )}
        </div>
      </div>

      {(loading || capacity) && (
        <CapacityPlanningSection capacity={capacity} loading={loading} weekStart={weekStart} onWeekStartChange={onWeekStartChange} />
      )}

      <ClientFormDialog
        open={createClientOpen}
        clientId={null}
        onClose={() => setCreateClientOpen(false)}
        onSuccess={(message) => {
          toast.success(message);
          setCreateClientOpen(false);
        }}
      />
    </div>
  );
}
