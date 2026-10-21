import { useState } from 'react';
import type { CapacityReportRow } from '@kora/contracts';
import styles from './CapacityReportTable.module.css';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Pagination } from '@/shared/components/ui/Pagination';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { DownloadIcon, SearchIcon } from '@/shared/components/icons/Icons';
import { useCapacityReport } from '../api/hours.queries';
import { hoursApi } from '../api/hours.api';
import { useCapacityReportState } from '../hooks/useCapacityReportState';
import { useHourEntriesExport } from '../hooks/useHourEntriesExport';
import { exportCapacityReport } from '../lib/hours-export';
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

/** Pestaña "Capacity" de Administración — ver la v1 `Usuarios/index.tsx` (pestaña `capacity`). */
export function CapacityReportTable() {
  const state = useCapacityReportState();
  const { data, isLoading, error } = useCapacityReport(state.query);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
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
        periodStart: state.periodStart,
        sortField: state.sort.field,
        sortDirection: state.sort.direction,
      };
      const first = await hoursApi.capacityReport({ ...baseQuery, page: 1, pageSize: EXPORT_PAGE_SIZE });
      const rest = await Promise.all(
        Array.from({ length: first.pageCount - 1 }, (_, index) =>
          hoursApi.capacityReport({ ...baseQuery, page: index + 2, pageSize: EXPORT_PAGE_SIZE }),
        ),
      );
      exportCapacityReport([...first.items, ...rest.flatMap((page) => page.items)], state.periodStart);
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
          options={state.periodOptions}
          value={state.periodStart}
          onChange={(event) => state.setPeriodStart(event.target.value)}
        />
      </div>

      <DataTable
        columns={COLUMNS}
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
    </div>
  );
}
