import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { HourEntrySummary, ListHourEntriesQuery } from '@kora/contracts';
import styles from './HourEntriesApprovalTable.module.css';
import { ticketPath } from '@/app/router/paths';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { Modal } from '@/shared/components/ui/Modal';
import { DEFAULT_PAGE_SIZE, Pagination } from '@/shared/components/ui/Pagination';
import { TextField } from '@/shared/components/ui/TextField';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';
import { ChevronDownIcon, CheckIcon, CloseIcon, UserIcon } from '@/shared/components/icons/Icons';
import { useApproveHourEntry, useHourEntriesList, useRejectHourEntry } from '../api/hours.queries';
import { resolvedApprover } from '../lib/approver';

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' });
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const pluralize = (count: number, singular: string, plural: string) => (count === 1 ? singular : plural);

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0]!;
  const second = parts.length > 1 ? parts[1]![0]! : (parts[0]![1] ?? '');
  return (first + second).toUpperCase();
}

interface LeaderGroup {
  key: string;
  leaderName: string;
  employeeCount: number;
  entries: HourEntrySummary[];
}

/**
 * Tabla de horas pendientes de aprobación con selección y acciones masivas.
 * La usan tanto `/horas/aprobaciones` (todo lo que el actor puede aprobar,
 * agrupado por líder responsable — `groupByUser`) como la ficha de
 * colaborador (acotada a un único `userId`, sin agrupar) — misma lógica de
 * selección/aprobación/rechazo, distinto alcance y presentación de datos.
 *
 * Agrupar por líder (no por colaborador) importa porque quien mira esta cola
 * no es necesariamente quien debe aprobarla — un PMO ve aquí lo pendiente de
 * varios equipos a la vez, y sin este agrupamiento parecía que el usuario
 * logueado era el responsable de aprobar todo. Cada grupo de líder es UNA
 * sola tabla (columna "Colaborador") en vez de una mini-tabla por persona:
 * repetir la cabecera "Fecha | Proyecto | ..." por cada colaborador se veía
 * roto, no como filas agrupadas.
 */
export function HourEntriesApprovalTable({
  query,
  emptyMessage = 'No hay horas pendientes de aprobación.',
  showTeamColumn = true,
  groupByUser = true,
}: {
  query: Partial<ListHourEntriesQuery>;
  emptyMessage?: string;
  showTeamColumn?: boolean;
  groupByUser?: boolean;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsedLeaders, setCollapsedLeaders] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Otro equipo o colaborador en el filtro vuelve a la página 1 (ajuste en
  // render, sin efecto: evita pedir primero la página vieja con el filtro nuevo).
  const queryKey = JSON.stringify(query);
  const [previousQueryKey, setPreviousQueryKey] = useState(queryKey);
  if (queryKey !== previousQueryKey) {
    setPreviousQueryKey(queryKey);
    setPage(1);
  }

  const { data, isLoading, error } = useHourEntriesList({ status: 'pending', sortField: 'date', ...query, page, pageSize });

  // Aprobar o rechazar saca registros de la cola: si la última página queda
  // vacía, se retrocede a la que ahora es la última.
  if (data && data.pageCount > 0 && page > data.pageCount) setPage(data.pageCount);
  const approveEntry = useApproveHourEntry();
  const rejectEntry = useRejectHourEntry();

  const entries = data?.items ?? [];
  const allSelected = entries.length > 0 && entries.every((entry) => selected.has(entry.id));
  const selectedHours = entries.filter((entry) => selected.has(entry.id)).reduce((sum, entry) => sum + entry.hours, 0);

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(entries.map((entry) => entry.id)));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleGroup = (groupEntries: HourEntrySummary[]) => {
    const allGroupSelected = groupEntries.every((entry) => selected.has(entry.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const entry of groupEntries) {
        if (allGroupSelected) next.delete(entry.id);
        else next.add(entry.id);
      }
      return next;
    });
  };
  const toggleCollapsed = (key: string) =>
    setCollapsedLeaders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const leaderGroups: LeaderGroup[] = [];
  if (groupByUser) {
    const leaderIndex = new Map<string, { leaderName: string; employeeIds: Set<string>; entries: HourEntrySummary[] }>();
    for (const entry of entries) {
      const approver = resolvedApprover(entry);
      const leaderKey = approver?.id ?? 'sin-aprobador';
      let leaderGroup = leaderIndex.get(leaderKey);
      if (!leaderGroup) {
        leaderGroup = { leaderName: approver?.fullName ?? 'Sin aprobador asignado', employeeIds: new Set(), entries: [] };
        leaderIndex.set(leaderKey, leaderGroup);
      }
      leaderGroup.entries.push(entry);
      leaderGroup.employeeIds.add(entry.user.id);
    }
    for (const [key, group] of leaderIndex) {
      leaderGroups.push({
        key,
        leaderName: group.leaderName,
        employeeCount: group.employeeIds.size,
        // Filas contiguas por colaborador para que se lean agrupadas aunque compartan una sola tabla.
        entries: [...group.entries].sort(
          (a, b) => a.user.fullName.localeCompare(b.user.fullName, 'es') || a.date.localeCompare(b.date),
        ),
      });
    }
    leaderGroups.sort((a, b) => a.leaderName.localeCompare(b.leaderName, 'es'));
  }

  const showError = (error: unknown, fallback: string) =>
    toast.error(error instanceof ApiRequestError ? error.message : fallback);

  const approveOne = async (entry: HourEntrySummary) => {
    try {
      await approveEntry.mutateAsync(entry.id);
    } catch (error) {
      showError(error, 'No se pudo aprobar el registro.');
      return;
    }
    toast.success('Registro aprobado.');
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(entry.id);
      return next;
    });
  };

  const approveSelected = async () => {
    const ids = [...selected];
    try {
      for (const id of ids) await approveEntry.mutateAsync(id);
    } catch (error) {
      showError(error, 'No se pudieron aprobar los registros.');
      return;
    }
    toast.success(`${ids.length} ${pluralize(ids.length, 'registro aprobado', 'registros aprobados')}.`);
    setSelected(new Set());
  };

  const confirmReject = async () => {
    const ids = [...selected];
    try {
      for (const id of ids) await rejectEntry.mutateAsync({ entryId: id, input: { reason } });
    } catch (error) {
      showError(error, 'No se pudieron rechazar los registros.');
      return;
    }
    toast.success(`${ids.length} ${pluralize(ids.length, 'registro rechazado', 'registros rechazados')}.`);
    setSelected(new Set());
    setReason('');
    setRejecting(false);
  };

  const columns: Column<HourEntrySummary>[] = [
    {
      key: 'select',
      header: '',
      width: '40px',
      render: (entry) => (
        <input type="checkbox" checked={selected.has(entry.id)} onChange={() => toggleOne(entry.id)} aria-label={`Seleccionar ${entry.user.fullName}`} />
      ),
    },
    ...(groupByUser
      ? [
          {
            key: 'collaborator',
            header: 'Colaborador',
            render: (entry: HourEntrySummary) => (
              <div className={styles.collaboratorCell}>
                <span className={styles.employeeAvatar}>{initials(entry.user.fullName)}</span>
                <span>
                  <div className={styles.employeeName}>{entry.user.fullName}</div>
                  {showTeamColumn && entry.team?.name && <div className={styles.employeeTeam}>{entry.team.name}</div>}
                </span>
              </div>
            ),
          } satisfies Column<HourEntrySummary>,
        ]
      : []),
    { key: 'date', header: 'Fecha', render: (entry) => formatDate(entry.date) },
    ...(showTeamColumn && !groupByUser
      ? [
          {
            key: 'team',
            header: 'Equipo',
            render: (entry: HourEntrySummary) => entry.team?.name ?? <span className={styles.empty}>—</span>,
          } satisfies Column<HourEntrySummary>,
        ]
      : []),
    {
      key: 'project',
      header: 'Proyecto',
      render: (entry) =>
        entry.project?.name || entry.ticket ? (
          <div className={styles.projectCell}>
            {entry.project?.name && <span>{entry.project.name}</span>}
            {entry.ticket && (
              <Link to={ticketPath(entry.ticket)} className={styles.ticketLink}>
                <Badge tone="info">{entry.ticket.legacyId ?? 'Ticket'}</Badge>
              </Link>
            )}
          </div>
        ) : (
          <span className={styles.empty}>—</span>
        ),
    },
    ...(!groupByUser
      ? [
          {
            key: 'approver',
            header: 'Debe aprobar',
            render: (entry: HourEntrySummary) => resolvedApprover(entry)?.fullName ?? <span className={styles.empty}>—</span>,
          } satisfies Column<HourEntrySummary>,
        ]
      : []),
    { key: 'assignment', header: 'Asignación', render: (entry) => entry.assignment ?? 'Desarrollo' },
    { key: 'category', header: 'Actividad', render: (entry) => entry.category || <span className={styles.empty}>—</span> },
    { key: 'hours', header: 'HH registradas', align: 'right', render: (entry) => formatHours(entry.hours) },
    {
      key: 'overtime',
      header: 'Horas Extra',
      render: (entry) => (entry.isOvertime ? <Badge tone="warning">Extra</Badge> : <span className={styles.empty}>—</span>),
    },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'right',
      width: '90px',
      render: (entry) => (
        <div className={styles.rowActions}>
          <Button variant="ghost" size="icon" onClick={() => void approveOne(entry)} aria-label="Aprobar" title="Aprobar">
            <CheckIcon size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSelected(new Set([entry.id]));
              setRejecting(true);
            }}
            aria-label="Rechazar"
            title="Rechazar"
            className={styles.dangerAction}
          >
            <CloseIcon size={16} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.wrapper}>
      {entries.length > 0 && (
        <button type="button" className={styles.selectAll} onClick={toggleAll}>
          {allSelected ? 'Quitar selección' : 'Seleccionar todas'}
        </button>
      )}

      {!groupByUser || isLoading || error || entries.length === 0 ? (
        <DataTable
          caption="Horas pendientes de aprobación"
          columns={columns}
          items={entries}
          getRowKey={(entry) => entry.id}
          loading={isLoading}
          error={error ? 'No se pudo cargar la cola de aprobación.' : null}
          emptyMessage={emptyMessage}
        />
      ) : (
        <div className={styles.leaderGroups}>
          {leaderGroups.map((leader) => {
            const leaderHours = leader.entries.reduce((sum, entry) => sum + entry.hours, 0);
            const leaderSelected = leader.entries.every((entry) => selected.has(entry.id));
            const collapsed = collapsedLeaders.has(leader.key);
            return (
              <div key={leader.key} className={styles.leaderGroup}>
                <div className={styles.leaderHeader}>
                  <input
                    type="checkbox"
                    checked={leaderSelected}
                    onChange={() => toggleGroup(leader.entries)}
                    aria-label={`Seleccionar todas las horas que aprueba ${leader.leaderName}`}
                  />
                  <span className={styles.leaderAvatar}>
                    <UserIcon size={15} />
                  </span>
                  <Badge tone="info" className={styles.leaderBadge}>
                    Debe aprobar: {leader.leaderName}
                  </Badge>
                  <span className={styles.leaderMeta}>
                    {leader.employeeCount} {pluralize(leader.employeeCount, 'colaborador', 'colaboradores')} ·{' '}
                    {leader.entries.length} {pluralize(leader.entries.length, 'registro', 'registros')}
                  </span>
                  <span className={styles.leaderTotal}>{formatHours(leaderHours)} hrs</span>
                  <button
                    type="button"
                    className={styles.collapseToggle}
                    onClick={() => toggleCollapsed(leader.key)}
                    aria-label={collapsed ? `Mostrar horas que aprueba ${leader.leaderName}` : `Ocultar horas que aprueba ${leader.leaderName}`}
                    aria-expanded={!collapsed}
                  >
                    <ChevronDownIcon size={16} className={collapsed ? styles.collapseIconClosed : styles.collapseIcon} />
                  </button>
                </div>

                {!collapsed && (
                  <DataTable
                    caption={`Horas que aprueba ${leader.leaderName}`}
                    columns={columns}
                    items={leader.entries}
                    getRowKey={(entry) => entry.id}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {data && (
        <Pagination
          page={page}
          pageCount={data.pageCount}
          total={data.total}
          pageSize={data.pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}

      <div className={styles.bulkBar}>
        <span className={styles.bulkSummary} aria-live="polite">
          {selected.size > 0 ? `Seleccionadas: ${selected.size} · ${formatHours(selectedHours)} hrs` : ''}
        </span>
        <Button variant="outlineDark" disabled={selected.size === 0} onClick={() => setRejecting(true)}>
          Rechazar las HH seleccionadas
        </Button>
        <Button disabled={selected.size === 0} onClick={() => void approveSelected()}>
          Aprobar las HH seleccionadas
        </Button>
      </div>

      <Modal open={rejecting} title="Rechazar registros de horas" onClose={() => setRejecting(false)}>
        <div className={styles.rejectForm}>
          <TextField
            label="Motivo del rechazo"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explica por qué se rechazan estos registros"
          />
          <div className={styles.rejectActions}>
            <Button variant="outline" onClick={() => setRejecting(false)}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={!reason.trim()} onClick={() => void confirmReject()}>
              Rechazar {selected.size} registro{selected.size === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
