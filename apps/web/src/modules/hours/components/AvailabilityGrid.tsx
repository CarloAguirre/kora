import { useEffect, useMemo, useState } from 'react';
import type { AvailabilityRoleFilter } from '@kora/contracts';
import styles from './AvailabilityGrid.module.css';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Switch } from '@/shared/components/ui/Switch';
import { WeekRangePicker } from '@/shared/components/ui/WeekRangePicker';
import { InfoIcon, SearchIcon, UserIcon } from '@/shared/components/icons/Icons';
import { useAvailability } from '../api/hours.queries';
import { useTeamsList } from '@/modules/teams/api/teams.queries';
import { currentLaborWeek, type LaborWeek } from '@/modules/forecast/lib/labor-weeks';

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
/** Igual que `DAILY_REGISTERED_HOURS_THRESHOLD` en la v1: umbral para marcar un día previo como "incompleto". */
const DAILY_REGISTERED_HOURS_THRESHOLD = 8;
const SEARCH_DEBOUNCE_MS = 300;

const ROLE_FILTER_OPTIONS: ReadonlyArray<{ value: AvailabilityRoleFilter; label: string }> = [
  { value: 'admin', label: 'Administrador' },
  { value: 'collaborator', label: 'Colaborador' },
  { value: 'leader', label: 'Líderes' },
];

type ViewMode = 'daily' | 'weekly';

interface Column {
  readonly key: string;
  readonly label: string;
  readonly dates: readonly string[];
}

function addDays(iso: string, amount: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function formatShort(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

function buildDailyColumns(week: LaborWeek): Column[] {
  return WEEKDAY_LABELS.map((label, index) => {
    const date = addDays(week.periodStart, index);
    return { key: date, label: `${label} ${formatShort(date)}`, dates: [date] };
  });
}

function buildWeeklyColumns(startWeek: LaborWeek, count: number): Column[] {
  return Array.from({ length: count }, (_, index) => {
    const periodStart = addDays(startWeek.periodStart, index * 7);
    const periodEnd = addDays(periodStart, 4);
    const dates = Array.from({ length: 5 }, (_, dayIndex) => addDays(periodStart, dayIndex));
    return { key: periodStart, label: `${formatShort(periodStart)} - ${formatShort(periodEnd)}`, dates };
  });
}

function chipClass(hours: number) {
  if (hours <= 0) return styles.chipEmpty;
  if (hours < 8) return styles.chipLow;
  return styles.chipFull;
}

/** Días hábiles anteriores de la semana actual (sin incluir hoy) — para la alerta "menos de 8h en días previos". */
function priorBusinessDaysOfCurrentWeek(): string[] {
  const week = currentLaborWeek();
  const todayIso = new Date().toISOString().slice(0, 10);
  const days: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    const iso = addDays(week.periodStart, index);
    if (iso < todayIso) days.push(iso);
  }
  return days;
}

/**
 * Pestaña "Registro de Horas" (Disponibilidad) de Administración — ver la v1
 * `Usuarios/index.tsx` (pestaña `registro-horas`). A diferencia de
 * `TeamAvailabilityHeatmap` (un equipo, sin filtros), esta vista es
 * organización completa: filtra por búsqueda, rol y equipo, y agrega la
 * alerta de "semana incompleta".
 */
export function AvailabilityGrid() {
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [selectedWeek, setSelectedWeek] = useState(() => currentLaborWeek());
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [role, setRole] = useState<AvailabilityRoleFilter | ''>('');
  const [teamId, setTeamId] = useState('');
  const [incompleteWeekOnly, setIncompleteWeekOnly] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: teams } = useTeamsList({ page: 1, pageSize: 200, sortField: 'name' });

  const columns = useMemo(
    () => (viewMode === 'daily' ? buildDailyColumns(selectedWeek) : buildWeeklyColumns(selectedWeek, 4)),
    [viewMode, selectedWeek],
  );
  const dateFrom = columns[0]?.dates[0] ?? selectedWeek.periodStart;
  const dateTo = columns[columns.length - 1]?.dates.at(-1) ?? selectedWeek.periodEnd;

  const priorBusinessDays = useMemo(() => priorBusinessDaysOfCurrentWeek(), []);

  const { data, isLoading } = useAvailability({
    dateFrom,
    dateTo,
    search: debouncedSearch || undefined,
    role: role || undefined,
    teamId: teamId || undefined,
  });

  const users = useMemo(() => {
    const all = data?.users ?? [];
    if (!incompleteWeekOnly) return all;
    return all.filter((user) =>
      priorBusinessDays.some(
        (iso) => (data?.registeredHoursByUserAndDate[`${user.userId}:${iso}`] ?? 0) < DAILY_REGISTERED_HOURS_THRESHOLD,
      ),
    );
  }, [data, incompleteWeekOnly, priorBusinessDays]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h2 className={styles.title}>Disponibilidad</h2>
          <p className={styles.subtitle}>Horas aprobadas por usuario habilitado en la vista seleccionada.</p>
        </div>

        <div className={styles.controls}>
          <div className={styles.toggleField}>
            <span className={styles.toggleLabel}>Vista</span>
            <div className={styles.toggle} role="group" aria-label="Vista de Registro de Horas">
              {(['daily', 'weekly'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={viewMode === mode}
                  className={[styles.toggleButton, viewMode === mode ? styles.toggleButtonActive : ''].join(' ')}
                  onClick={() => setViewMode(mode)}
                >
                  {mode === 'daily' ? 'Diario' : 'Semanal'}
                </button>
              ))}
            </div>
          </div>
          <WeekRangePicker
            className={styles.periodField}
            periodStart={selectedWeek.periodStart}
            periodEnd={selectedWeek.periodEnd}
            onChange={(next) => setSelectedWeek({ ...next, label: '' })}
          />
        </div>
      </div>

      <div className={styles.filters}>
        <TextField
          className={styles.search}
          label="Buscar usuario"
          type="search"
          placeholder="Por nombre, correo, rol o equipo..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          iconLeft={<SearchIcon size={16} />}
        />
        <Select
          className={styles.roleFilter}
          label="Rol"
          placeholder="Todos"
          options={ROLE_FILTER_OPTIONS}
          value={role}
          onChange={(event) => setRole(event.target.value as AvailabilityRoleFilter | '')}
        />
        <Select
          className={styles.teamFilter}
          label="Equipo"
          placeholder="Todos"
          options={(teams?.items ?? []).map((team) => ({ value: team.id, label: team.name }))}
          value={teamId}
          onChange={(event) => setTeamId(event.target.value)}
        />
        <div className={styles.incompleteFilter}>
          <span className={styles.incompleteFilterLabel}>Alerta</span>
          <div className={styles.incompleteFilterControl}>
            <label className={styles.incompleteFilterToggle}>
              <Switch checked={incompleteWeekOnly} onChange={setIncompleteWeekOnly} label="Solo con menos de 8h en días previos" />
              <span className={styles.incompleteFilterText}>Menos de 8h en días previos</span>
            </label>
            <span
              className={styles.incompleteFilterInfo}
              tabIndex={0}
              title="Evalúa días hábiles anteriores de la semana actual; no incluye hoy."
            >
              <InfoIcon size={14} />
            </span>
          </div>
        </div>
      </div>

      {!isLoading && users.length === 0 && <p className={styles.empty}>Sin usuarios habilitados para mostrar disponibilidad.</p>}

      {(isLoading || users.length > 0) && (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.memberHeaderCell} scope="col" />
                {columns.map((column) => (
                  <th key={column.key} className={styles.headerCell} scope="col">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 3 }, (_, index) => (
                  <tr key={index} aria-hidden="true">
                    <td className={styles.memberCell}>
                      <div className={styles.skeletonBar} />
                    </td>
                    {columns.map((column) => (
                      <td key={column.key} className={styles.cell} />
                    ))}
                  </tr>
                ))}

              {!isLoading &&
                users.map((user) => (
                  <tr key={user.userId}>
                    <td className={styles.memberCell}>
                      <UserIcon size={14} />
                      <span className={styles.memberInfo}>
                        <span>{user.fullName}</span>
                        {user.teamName && <span className={styles.memberMeta}>{user.teamName}</span>}
                      </span>
                    </td>
                    {columns.map((column) => {
                      const hours = column.dates.reduce(
                        (sum, date) => sum + (data?.hoursByUserAndDate[`${user.userId}:${date}`] ?? 0),
                        0,
                      );
                      return (
                        <td key={column.key} className={styles.cell}>
                          <span
                            className={[styles.chip, chipClass(hours)].join(' ')}
                            role="status"
                            aria-label={`${user.fullName} ${column.label}: ${hours} horas`}
                          >
                            {hours.toLocaleString('es-CL', { maximumFractionDigits: 1 })}h
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
