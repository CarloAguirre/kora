import styles from './PeriodRangeFilter.module.css';
import { TextField } from './TextField';
import { WeekRangePicker } from './WeekRangePicker';
import { currentLaborWeek } from '@/modules/forecast/lib/labor-weeks';

export type PeriodRangeMode = 'week' | 'range';

/**
 * Período elegido. En modo `week` va de lunes a domingo (incluye el fin de
 * semana para no perder horas registradas sábado o domingo); en modo `range`
 * las fechas son libres y pueden venir vacías (sin límite por ese lado).
 */
export interface PeriodRange {
  mode: PeriodRangeMode;
  dateFrom: string;
  dateTo: string;
}

export interface PeriodRangeFilterProps {
  value: PeriodRange;
  onChange: (next: PeriodRange) => void;
  /** Con `false` no se muestran las etiquetas sobre los campos (p. ej. en la cabecera de un card). */
  showLabels?: boolean;
  className?: string;
}

const MODE_OPTIONS: readonly { value: PeriodRangeMode; label: string }[] = [
  { value: 'week', label: 'Semana' },
  { value: 'range', label: 'Rango' },
];

function addDaysIso(iso: string, amount: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function todayIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
}

/** Semana (lunes a domingo) que contiene `iso`. */
export function weekPeriod(iso: string = todayIso()): PeriodRange {
  const { periodStart } = currentLaborWeek(new Date(`${iso}T00:00:00Z`));
  return { mode: 'week', dateFrom: periodStart, dateTo: addDaysIso(periodStart, 6) };
}

/** Mes calendario completo que contiene `iso`. */
export function monthPeriod(iso: string = todayIso()): PeriodRange {
  const [year, month] = iso.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthPrefix = iso.slice(0, 7);
  return { mode: 'range', dateFrom: `${monthPrefix}-01`, dateTo: `${monthPrefix}-${String(lastDay).padStart(2, '0')}` };
}

/**
 * Filtro de período con dos modos: "Semana" (el calendario de semana laboral
 * de `WeekRangePicker`) o "Rango" (desde/hasta libres, p. ej. para ver un mes
 * completo). Al pasar de Semana a Rango se abre el mes de la semana elegida;
 * al volver a Semana, la semana del "desde" (o la actual si no hay).
 */
export function PeriodRangeFilter({ value, onChange, showLabels = true, className }: PeriodRangeFilterProps) {
  const switchMode = (mode: PeriodRangeMode) => {
    if (mode === value.mode) return;
    onChange(mode === 'week' ? weekPeriod(value.dateFrom || undefined) : monthPeriod(value.dateFrom || undefined));
  };

  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      <div className={styles.modeField}>
        {showLabels && <span className={styles.label}>Período</span>}
        <div className={styles.toggle} role="group" aria-label="Tipo de período">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={value.mode === option.value}
              className={[styles.toggleButton, value.mode === option.value ? styles.toggleButtonActive : ''].join(' ')}
              onClick={() => switchMode(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {value.mode === 'week' ? (
        <WeekRangePicker
          label={showLabels ? 'Semana' : ''}
          className={styles.weekField}
          periodStart={value.dateFrom}
          periodEnd={addDaysIso(value.dateFrom, 4)}
          displayPeriodEnd={value.dateTo}
          onChange={({ periodStart }) => onChange(weekPeriod(periodStart))}
        />
      ) : (
        <>
          <TextField
            className={styles.dateField}
            label={showLabels ? 'Desde' : undefined}
            aria-label={showLabels ? undefined : 'Desde'}
            type="date"
            value={value.dateFrom}
            max={value.dateTo || undefined}
            onChange={(event) => onChange({ ...value, dateFrom: event.target.value })}
          />
          <TextField
            className={styles.dateField}
            label={showLabels ? 'Hasta' : undefined}
            aria-label={showLabels ? undefined : 'Hasta'}
            type="date"
            value={value.dateTo}
            min={value.dateFrom || undefined}
            onChange={(event) => onChange({ ...value, dateTo: event.target.value })}
          />
        </>
      )}
    </div>
  );
}
