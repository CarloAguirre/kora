import { useEffect, useRef, useState } from 'react';
import styles from './WeekRangePicker.module.css';
import { Button } from './Button';
import { CalendarIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '../icons/Icons';
import { currentLaborWeek, formatShortRange } from '@/modules/forecast/lib/labor-weeks';

export interface WeekRangePickerProps {
  label?: string;
  /** Lunes de la semana seleccionada (ISO `yyyy-mm-dd`). */
  periodStart: string;
  /** Viernes de la semana seleccionada (ISO `yyyy-mm-dd`). */
  periodEnd: string;
  onChange: (period: { periodStart: string; periodEnd: string }) => void;
  className?: string;
  /**
   * Fin real del rango visible en pantalla, si abarca más de la semana seleccionada
   * (p. ej. una vista "Semanal" que muestra 4 semanas desde `periodStart`). Solo
   * afecta la etiqueta del botón; la semana que se elige en el calendario sigue
   * siendo `periodStart`–`periodEnd`. Por defecto es `periodEnd`.
   */
  displayPeriodEnd?: string;
  /** Texto de ayuda bajo el calendario. Por defecto explica que la semana es lun-vie. */
  hint?: string;
}

const WEEKDAY_LABELS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const MONTH_LABELS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Grilla de 6 semanas (lunes a domingo) que cubre el mes, con los días de relleno de meses vecinos. */
function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(Date.UTC(year, month, 1));
  const firstWeekday = first.getUTCDay();
  const offsetToMonday = firstWeekday === 0 ? 6 : firstWeekday - 1;
  const gridStart = new Date(Date.UTC(year, month, 1 - offsetToMonday));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);
    return date;
  });
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(iso: string, amount: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return toIsoDate(date);
}

/**
 * Selector de semana laboral con calendario — reemplaza el `<select>` nativo
 * (lista plana de 15 rangos de fecha) por un botón que abre un mini
 * calendario mensual: se ve y se elige la semana (lun–vie) de un vistazo, sin
 * límite de semanas pasadas/futuras.
 */
export function WeekRangePicker({
  label = 'Período',
  periodStart,
  periodEnd,
  onChange,
  className,
  displayPeriodEnd,
  hint = 'Semana laboral: lunes a viernes',
}: WeekRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => new Date(`${periodStart}T00:00:00Z`));
  const [pending, setPending] = useState({ periodStart, periodEnd });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function openPicker() {
    setViewDate(new Date(`${periodStart}T00:00:00Z`));
    setPending({ periodStart, periodEnd });
    setOpen(true);
  }

  function pickDay(date: Date) {
    const week = currentLaborWeek(date);
    setPending({ periodStart: week.periodStart, periodEnd: week.periodEnd });
    if (date.getUTCMonth() !== viewDate.getUTCMonth() || date.getUTCFullYear() !== viewDate.getUTCFullYear()) {
      setViewDate(date);
    }
  }

  function apply() {
    onChange(pending);
    setOpen(false);
  }

  const year = viewDate.getUTCFullYear();
  const month = viewDate.getUTCMonth();
  const days = buildMonthGrid(year, month);

  // Cuántos días más allá de la semana ancla se ven en pantalla (p. ej. 21 días
  // si la vista "Semanal" muestra la semana elegida más las 3 siguientes). Se
  // aplica sobre `pending` para que la previsualización se mueva junto con el
  // día que se está por elegir, no con la selección ya aplicada.
  const previewExtraDays = displayPeriodEnd
    ? Math.round(
        (new Date(`${displayPeriodEnd}T00:00:00Z`).getTime() - new Date(`${periodEnd}T00:00:00Z`).getTime()) / 86_400_000,
      )
    : 0;
  const previewEnd = previewExtraDays > 0 ? addDays(pending.periodEnd, previewExtraDays) : null;

  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(' ')} ref={containerRef}>
      <span className={styles.label}>{label}</span>
      <button
        type="button"
        className={[styles.trigger, open ? styles.triggerOpen : ''].filter(Boolean).join(' ')}
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={styles.triggerLabel}>
          <CalendarIcon size={16} className={styles.triggerIcon} />
          {formatShortRange(periodStart, displayPeriodEnd ?? periodEnd)}
        </span>
        <ChevronDownIcon size={16} className={styles.chevron} />
      </button>

      {open && (
        <div className={styles.popover} role="dialog" aria-label="Elegir semana">
          <div className={styles.calHeader}>
            <button
              type="button"
              className={styles.calNavBtn}
              aria-label="Mes anterior"
              onClick={() => setViewDate(new Date(Date.UTC(year, month - 1, 1)))}
            >
              <ChevronLeftIcon size={16} />
            </button>
            <span className={styles.calMonth}>
              {MONTH_LABELS[month]} {year}
            </span>
            <button
              type="button"
              className={styles.calNavBtn}
              aria-label="Mes siguiente"
              onClick={() => setViewDate(new Date(Date.UTC(year, month + 1, 1)))}
            >
              <ChevronRightIcon size={16} />
            </button>
          </div>

          <div className={styles.calWeekdays}>
            {WEEKDAY_LABELS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className={styles.calGrid}>
            {days.map((date) => {
              const iso = toIsoDate(date);
              const inRange = iso >= pending.periodStart && iso <= pending.periodEnd;
              const dayOfWeek = date.getUTCDay();
              const isWeekday = dayOfWeek !== 0 && dayOfWeek !== 6;
              const inPreview = !inRange && isWeekday && !!previewEnd && iso > pending.periodEnd && iso <= previewEnd;
              return (
                <button
                  key={iso}
                  type="button"
                  className={[
                    styles.calDayBtn,
                    date.getUTCMonth() !== month ? styles.calDayMuted : '',
                    inRange ? styles.calDayInRange : '',
                    inPreview ? styles.calDayPreview : '',
                    iso === pending.periodStart ? styles.calDayRangeStart : '',
                    iso === pending.periodEnd ? styles.calDayRangeEnd : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => pickDay(date)}
                  title={inPreview ? 'También visible en la vista semanal' : undefined}
                >
                  {date.getUTCDate()}
                </button>
              );
            })}
          </div>

          <p className={styles.calHint}>{hint}</p>

          <div className={styles.calActions}>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={apply}>
              Aplicar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
