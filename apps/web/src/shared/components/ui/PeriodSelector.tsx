import styles from './PeriodSelector.module.css';
import { Select } from './Select';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MONTH_OPTIONS = MONTHS.map((label, i) => ({ value: String(i + 1), label }));
const DEFAULT_YEARS = [2025, 2026, 2027];

export interface PeriodSelectorProps {
  year: number;
  month: number;
  onChange: (period: { year: number; month: number }) => void;
  years?: readonly number[];
}

/** Selector de mes/año con navegación ‹›, usado por los paneles de facturación con corte por período. */
export function PeriodSelector({ year, month, onChange, years = DEFAULT_YEARS }: PeriodSelectorProps) {
  const yearOptions = years.map((y) => ({ value: String(y), label: String(y) }));

  const changeMonth = (delta: number) => {
    let nextMonth = month + delta;
    let nextYear = year;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    onChange({ year: nextYear, month: nextMonth });
  };

  return (
    <div className={styles.periodSelect}>
      <button type="button" className={styles.periodNav} onClick={() => changeMonth(-1)} aria-label="Mes anterior">
        ‹
      </button>
      <Select aria-label="Mes" options={MONTH_OPTIONS} value={String(month)} onChange={(e) => onChange({ year, month: Number(e.target.value) })} />
      <Select aria-label="Año" options={yearOptions} value={String(year)} onChange={(e) => onChange({ year: Number(e.target.value), month })} />
      <button type="button" className={styles.periodNav} onClick={() => changeMonth(1)} aria-label="Mes siguiente">
        ›
      </button>
    </div>
  );
}
