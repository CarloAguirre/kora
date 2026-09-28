import { useState } from 'react';
import styles from './ForecastLayout.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { WeekRangePicker } from '@/shared/components/ui/WeekRangePicker';
import { useForecastCapacity } from '../api/forecast.queries';
import { currentLaborWeek } from '../lib/labor-weeks';
import { ForecastKpis, ForecastPlanningSection } from './ForecastPlanning';

/**
 * Vista de solo lectura — réplica de `Forecast/index.tsx` (v1): la ve
 * admin, PMO y líderes sin equipo propio. Reemplaza el RPC
 * `get_forecast_capacity_view` + la agregación en el cliente
 * (`buildColaboradores`) por una respuesta ya agregada en el backend — ver
 * docs/DECISION-M6-FORECAST.md.
 */
export function ForecastCapacityView() {
  const [period, setPeriod] = useState(() => currentLaborWeek());
  const { data, isLoading, error } = useForecastCapacity({ periodStart: period.periodStart, periodEnd: period.periodEnd });
  const members = data?.members ?? [];

  return (
    <DashboardLayout title="Forecast">
      <div className={styles.page}>
        {/* El título "Forecast" del Figma ya lo pinta la TopBar; aquí solo queda el período. */}
        <div className={styles.header}>
          <WeekRangePicker
            className={styles.periodField}
            periodStart={period.periodStart}
            periodEnd={period.periodEnd}
            onChange={(next) => setPeriod({ ...next, label: '' })}
          />
        </div>

        <ForecastKpis members={members} />

        <ForecastPlanningSection members={members} loading={isLoading} error={error ? 'No se pudo cargar el forecast.' : null} />
      </div>
    </DashboardLayout>
  );
}
