import { useState } from 'react';
import styles from './ForecastLayout.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { WeekRangePicker } from '@/shared/components/ui/WeekRangePicker';
import { useForecastCapacity } from '../api/forecast.queries';
import { currentLaborWeek, hasWeekStarted } from '../lib/labor-weeks';
import { ForecastKpis, ForecastPlanningSection } from './ForecastPlanning';
import { ForecastWeeksGrid } from './ForecastWeeksGrid';

type ViewMode = 'week' | 'weeks';

const VIEW_OPTIONS = [
  { value: 'week', label: 'Semana' },
  { value: 'weeks', label: 'Próximas semanas' },
] as const;

/**
 * Vista de solo lectura — réplica de `Forecast/index.tsx` (v1): la ve
 * admin, PMO y líderes sin equipo propio. Reemplaza el RPC
 * `get_forecast_capacity_view` + la agregación en el cliente
 * (`buildColaboradores`) por una respuesta ya agregada en el backend — ver
 * docs/DECISION-M6-FORECAST.md.
 */
export function ForecastCapacityView() {
  const [view, setView] = useState<ViewMode>('week');
  const [period, setPeriod] = useState(() => currentLaborWeek());
  const { data, isLoading, error } = useForecastCapacity({ periodStart: period.periodStart, periodEnd: period.periodEnd });
  const members = data?.members ?? [];

  return (
    <DashboardLayout title="Forecast">
      <div className={styles.page}>
        {/* El título "Forecast" del Figma ya lo pinta la TopBar; aquí solo quedan la vista y el período. */}
        <div className={styles.header}>
          <SegmentedControl
            aria-label="Vista"
            options={VIEW_OPTIONS}
            value={view}
            onChange={(value) => setView(value as ViewMode)}
          />
          {view === 'week' && (
            <div className={styles.headerFields}>
              <WeekRangePicker
                className={styles.periodField}
                periodStart={period.periodStart}
                periodEnd={period.periodEnd}
                onChange={(next) => setPeriod({ ...next, label: '' })}
              />
            </div>
          )}
        </div>

        {view === 'week' ? (
          <>
            <ForecastKpis members={members} />

            <ForecastPlanningSection
              members={members}
              loading={isLoading}
              error={error ? 'No se pudo cargar el forecast.' : null}
              showLogged={hasWeekStarted(period.periodStart)}
            />
          </>
        ) : (
          <ForecastWeeksGrid />
        )}
      </div>
    </DashboardLayout>
  );
}
