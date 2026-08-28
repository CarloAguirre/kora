import { Link } from 'react-router-dom';
import styles from './HoursListPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
import { MyHourEntriesPanel } from '../components/MyHourEntriesPanel';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';

/**
 * Mis horas: alta, historial y edición — cubre lo que en la v1 vive repartido
 * entre "Historial Reciente" (`ColaboradorDashboard`) y el modal
 * `RegistroHHModal`, reutilizado desde ocho paneles distintos. Las tarjetas
 * de KPI (progreso diario, semáforo) de ese panel son parte del rediseño de
 * dashboard que le corresponde a M7, no a esta ficha.
 */
export function HoursListPage() {
  const { can } = usePermissions();

  return (
    <DashboardLayout title="Mis horas">
      <div className={styles.page}>
        <Card>
          <MyHourEntriesPanel />
        </Card>

        {can('hours:approve') && (
          <p className={styles.approvalsLink}>
            ¿Necesitas aprobar horas de tu equipo? <Link to="/horas/aprobaciones">Ir a aprobaciones</Link>
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}
