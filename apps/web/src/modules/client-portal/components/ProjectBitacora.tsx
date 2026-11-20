import { useMemo, useState } from 'react';
import styles from './ProjectBitacora.module.css';
import { TextField } from '@/shared/components/ui/TextField';
import { SearchIcon } from '@/shared/components/icons/Icons';
import type { ClientBitacoraEntry, ClientBitacoraEntryKind } from '../types';

type BitacoraTypeFilter = 'all' | 'incidents' | 'work';

const TYPE_FILTERS: ReadonlyArray<{ key: BitacoraTypeFilter; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'incidents', label: 'Incidentes' },
  { key: 'work', label: 'Entregas y tareas' },
];

/** Cuántas entradas se ven antes de tener que pedir "Ver más". */
const PAGE_SIZE = 5;

/**
 * Glifos tal cual el Figma (node 9663:24685, variante "Kora · Proyectos y
 * Soporte 2") — son texto plano en el diseño, no íconos Lucide, así que se
 * reproducen igual en vez de forzar un ícono que no calce.
 */
const KIND_GLYPH: Readonly<Record<ClientBitacoraEntryKind, string>> = {
  completed: '✓',
  marked: '→',
  attention: '⚑',
  milestone: '★',
  pending: '◆',
};

const KIND_ICON_CLASS: Readonly<Record<ClientBitacoraEntryKind, string>> = {
  completed: 'iconCompleted',
  marked: 'iconMarked',
  attention: 'iconAttention',
  milestone: 'iconMilestone',
  pending: 'iconPending',
};

/**
 * "Bitácora" — reemplaza "Hitos y aprobaciones" + "Puntos de atención e
 * incidentes" (Figma node 9663:24685): un feed cronológico único, cada
 * entrada con su propia etiqueta de fase en vez de vivir bajo un solo
 * `milestonesCaption` de la fase activa.
 */
export function ProjectBitacora({ entries }: { entries: readonly ClientBitacoraEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  // Mismos filtros que la Bitácora interna (`BitacoraCard`): Tipo, Buscar, Desde y Hasta.
  const [filter, setFilter] = useState<BitacoraTypeFilter>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter === 'incidents' && !entry.isIncident) return false;
      if (filter === 'work' && !entry.isDeliveryOrTask) return false;
      if (dateFrom && entry.filterDate < dateFrom) return false;
      if (dateTo && entry.filterDate > dateTo) return false;
      if (q) {
        const haystack = `${entry.title} ${entry.registeredByName} ${entry.phaseTag ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [entries, filter, search, dateFrom, dateTo]);
  const visibleEntries = expanded ? filteredEntries : filteredEntries.slice(0, PAGE_SIZE);

  return (
    <div className={styles.card}>
      {entries.length > 0 && (
        <div className={styles.toolbar}>
          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>Tipo</span>
            <div className={styles.filterTabs} role="group" aria-label="Filtrar por tipo">
              {TYPE_FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  className={[styles.filterTab, filter === key ? styles.filterTabActive : ''].join(' ')}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <TextField
            className={styles.search}
            label="Buscar"
            type="search"
            placeholder="Buscar en la bitácora…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            iconLeft={<SearchIcon size={16} />}
          />
          <TextField className={styles.date} type="date" label="Desde" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <TextField className={styles.date} type="date" label="Hasta" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </div>
      )}
      {entries.length === 0 && <p className={styles.empty}>Aún no hay registros en la bitácora de este proyecto.</p>}
      {entries.length > 0 && filteredEntries.length === 0 && <p className={styles.empty}>No hay registros que coincidan con el filtro.</p>}
      {visibleEntries.map((entry) => (
        <BitacoraEntryRow key={entry.id} entry={entry} />
      ))}
      {!expanded && filteredEntries.length > PAGE_SIZE && (
        <button type="button" className={styles.seeMore} onClick={() => setExpanded(true)}>
          Ver más ({filteredEntries.length - PAGE_SIZE})
        </button>
      )}
    </div>
  );
}

/** Una fila de bitácora sola, sin la tarjeta ni el botón "Ver más" — la
 *  reutiliza `PhaseRoadmap` para el mini-listado "Registros de bitácora
 *  relacionados" dentro de cada fase (Figma: mismas filas, sin envoltorio de
 *  tarjeta propia ahí). */
export function BitacoraEntryRow({ entry }: { entry: ClientBitacoraEntry }) {
  return (
    <div className={styles.row}>
      <span className={[styles.icon, styles[KIND_ICON_CLASS[entry.kind]]].join(' ')}>{KIND_GLYPH[entry.kind]}</span>
      <div className={styles.body}>
        <div className={styles.headRow}>
          <span className={styles.title}>{entry.title}</span>
          <span className={[styles.statusBadge, styles[`tone_${entry.statusTone}`]].join(' ')}>{entry.statusLabel}</span>
        </div>
        <p className={styles.meta}>
          Registro por: {entry.registeredByName} - {entry.registeredAt}
          {entry.phaseTag && <> · {entry.phaseTag}</>}
        </p>
        <p className={styles.description}>{entry.description}</p>
        {entry.secondaryNote && <p className={[styles.secondaryNote, styles[`tone_${entry.statusTone}`]].join(' ')}>{entry.secondaryNote}</p>}
      </div>
    </div>
  );
}
