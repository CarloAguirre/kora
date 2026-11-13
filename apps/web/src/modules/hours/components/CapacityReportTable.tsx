import { useState } from 'react';
import type { CapacityReportRow } from '@kora/contracts';
import styles from './CapacityReportTable.module.css';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Pagination } from '@/shared/components/ui/Pagination';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { DropdownMenu } from '@/shared/components/ui/DropdownMenu';
import { ConfirmActionDialog } from '@/shared/components/ui/ConfirmActionDialog';
import { useToast } from '@/shared/components/ui/Toast';
import { DownloadIcon, SearchIcon } from '@/shared/components/icons/Icons';
import { useCapacityReport, useDeleteHourEntry, useHourEntryDetail } from '../api/hours.queries';
import { hoursApi } from '../api/hours.api';
import { useCapacityReportState } from '../hooks/useCapacityReportState';
import { useHourEntriesExport } from '../hooks/useHourEntriesExport';
import { exportCapacityReport } from '../lib/hours-export';
import { canEditAnyMonth } from '../lib/edit-window';
import { HourEntryFormDialog } from './HourEntryFormDialog';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { ApiRequestError } from '@/shared/lib/api-client';

const EXPORT_PAGE_SIZE = 200;

const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatMonth(periodDate: string): string {
  const [, month] = periodDate.split('-').map(Number);
  return MONTH_LABELS[(month ?? 1) - 1] ?? periodDate;
}

function formatPeriod(periodDate: string): string {
  const [year, month, day] = periodDate.split('-');
  return `${day}/${month}/${year}`;
}

const COLUMNS: ReadonlyArray<Column<CapacityReportRow>> = [
  { key: 'supervisorFullName', header: 'Responsable', sortable: true, render: (r) => r.supervisorFullName },
  { key: 'collaboratorFullName', header: 'Colaborador', sortable: true, render: (r) => r.collaboratorFullName },
  { key: 'month', header: 'Mes', render: (r) => formatMonth(r.periodDate) },
  { key: 'periodDate', header: 'Periodo', sortable: true, render: (r) => formatPeriod(r.periodDate) },
  { key: 'clientName', header: 'Cliente', sortable: true, render: (r) => r.clientName },
  { key: 'projectName', header: 'Proyecto', sortable: true, render: (r) => r.projectName },
  { key: 'type', header: 'Tipo', sortable: true, render: (r) => r.type },
  { key: 'dedicatedHours', header: 'HH dedicadas', sortable: true, align: 'right', render: (r) => r.dedicatedHours.toLocaleString('es-CL') },
  { key: 'dedicatedDays', header: 'Días dedicados', sortable: true, align: 'right', render: (r) => String(r.dedicatedDays) },
  { key: 'dedicationPercent', header: '% dedicación', sortable: true, align: 'right', render: (r) => `${r.dedicationPercent}%` },
];

/**
 * Pestaña "Capacity" de Administración — ver la v1 `Usuarios/index.tsx` (pestaña `capacity`).
 * Cada fila es un registro de horas aprobado: admin/PMO pueden editarlo o
 * eliminarlo desde aquí, sin la restricción del mes en curso.
 */
export function CapacityReportTable() {
  const { user } = useAuth();
  const toast = useToast();
  const state = useCapacityReportState();
  const { data, isLoading, error } = useCapacityReport(state.query, { enabled: state.rangeError === null });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'view' | 'edit'; entryId: string } | null>(null);
  const [deleting, setDeleting] = useState<CapacityReportRow | null>(null);
  // La fila del reporte no trae todo lo que necesita el formulario: se pide el detalle del registro.
  const { data: dialogEntry } = useHourEntryDetail(dialog?.entryId ?? null);
  const deleteEntry = useDeleteHourEntry();
  const canManage = canEditAnyMonth(user?.role);

  const columns: ReadonlyArray<Column<CapacityReportRow>> = canManage
    ? [
        ...COLUMNS,
        {
          key: 'actions',
          header: 'Acciones',
          align: 'right',
          width: '80px',
          render: (row) => (
            <div className={styles.actions}>
              <DropdownMenu
                items={[
                  { key: 'ver', label: 'Ver detalle', onSelect: () => setDialog({ kind: 'view', entryId: row.id }) },
                  { key: 'editar', label: 'Editar', onSelect: () => setDialog({ kind: 'edit', entryId: row.id }) },
                  { key: 'eliminar', label: 'Eliminar', tone: 'danger', onSelect: () => setDeleting(row) },
                ]}
                trigger={({ onClick }) => (
                  <Button variant="ghost" size="icon" onClick={onClick} aria-label={`Acciones — ${row.collaboratorFullName}`} title="Acciones">
                    ⋮
                  </Button>
                )}
              />
            </div>
          ),
        },
      ]
    : COLUMNS;

  // Sin try/catch: si falla, `ConfirmActionDialog` queda abierto y muestra el error.
  const confirmDelete = async () => {
    if (!deleting) return;
    await deleteEntry.mutateAsync(deleting.id);
    toast.success('Se eliminó el registro de horas.');
  };
  // "Descargar todo": mismo Excel que "Descargar registro de horas" de la consola del líder,
  // pero sin filtros: con `hours:read_all` el backend devuelve los registros
  // de toda la organización (comentarios incluidos).
  const hourEntriesExport = useHourEntriesExport();

  const handleExport = async () => {
    setExportError(null);
    setExporting(true);
    try {
      // El contrato limita `pageSize` a 200: se pagina hasta traer el reporte completo.
      const baseQuery = {
        search: state.query.search,
        dateFrom: state.dateFrom,
        dateTo: state.dateTo,
        sortField: state.sort.field,
        sortDirection: state.sort.direction,
      };
      const first = await hoursApi.capacityReport({ ...baseQuery, page: 1, pageSize: EXPORT_PAGE_SIZE });
      const rest = await Promise.all(
        Array.from({ length: first.pageCount - 1 }, (_, index) =>
          hoursApi.capacityReport({ ...baseQuery, page: index + 2, pageSize: EXPORT_PAGE_SIZE }),
        ),
      );
      exportCapacityReport([...first.items, ...rest.flatMap((page) => page.items)], state.dateFrom, state.dateTo);
    } catch (exportErr) {
      setExportError(exportErr instanceof ApiRequestError ? exportErr.message : 'No se pudo generar el Excel.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h2 className={styles.title}>Resumen de horas por colaborador</h2>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="outlineDark"
            iconLeft={<DownloadIcon size={18} />}
            loading={hourEntriesExport.exporting}
            loadingText="Generando…"
            onClick={() => void hourEntriesExport.exportEntries({ sortField: 'date', sortDirection: 'desc' })}
          >
            Descargar todo
          </Button>
          <Button
            variant="outlineDark"
            iconLeft={<DownloadIcon size={18} />}
            loading={exporting}
            loadingText="Generando…"
            disabled={state.rangeError !== null}
            onClick={() => void handleExport()}
          >
            Descargar datos filtrados
          </Button>
        </div>
      </div>

      {(exportError ?? hourEntriesExport.exportError) && (
        <p className={styles.exportError} role="alert">
          {exportError ?? hourEntriesExport.exportError}
        </p>
      )}

      <div className={styles.filters}>
        <TextField
          className={styles.search}
          label="Filtrar"
          type="search"
          placeholder="Por nombre, responsable, proyecto, cliente, etc."
          value={state.search}
          onChange={(event) => state.setSearch(event.target.value)}
          iconLeft={<SearchIcon size={16} />}
        />
        <Select
          className={styles.period}
          label="Periodo"
          placeholder="Personalizado"
          options={state.periodOptions}
          value={state.periodStart}
          onChange={(event) => state.setPeriodStart(event.target.value)}
        />
        <TextField
          className={styles.date}
          label="Fecha inicio"
          type="date"
          required
          value={state.dateFrom}
          onChange={(event) => state.setDateFrom(event.target.value)}
        />
        <TextField
          className={styles.date}
          label="Fecha fin"
          type="date"
          required
          value={state.dateTo}
          errorText={state.rangeError ?? undefined}
          onChange={(event) => state.setDateTo(event.target.value)}
        />
      </div>

      <DataTable
        columns={columns}
        items={data?.items ?? []}
        getRowKey={(row) => row.id}
        loading={isLoading}
        error={error ? (error instanceof ApiRequestError ? error.message : 'No se pudo cargar el reporte de Capacity.') : null}
        emptyMessage="No se encontraron registros de horas."
        sort={state.sort}
        onSortChange={state.toggleSort}
      />

      {data && (
        <Pagination
          page={state.page}
          pageCount={data.pageCount}
          total={data.total}
          pageSize={data.pageSize}
          onPageChange={state.setPage}
          onPageSizeChange={state.setPageSize}
        />
      )}

      <HourEntryFormDialog
        open={dialog !== null && dialogEntry?.id === dialog.entryId}
        entry={dialogEntry ?? null}
        readOnly={dialog?.kind === 'view'}
        onClose={() => setDialog(null)}
        onSuccess={(message) => {
          toast.success(message);
          setDialog(null);
        }}
      />

      <ConfirmActionDialog
        open={deleting !== null}
        title="Eliminar registro de horas"
        description={
          deleting
            ? `Se eliminarán ${deleting.dedicatedHours.toLocaleString('es-CL')} h de ${deleting.collaboratorFullName} del ${formatPeriod(deleting.periodDate)}. Esta acción no se puede deshacer.`
            : ''
        }
        warning="El registro ya está aprobado: se descontará del consumo del proyecto."
        confirmLabel="Eliminar"
        destructive
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
