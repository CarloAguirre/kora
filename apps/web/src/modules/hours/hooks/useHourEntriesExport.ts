import { useCallback, useState } from 'react';
import type { ListHourEntriesQuery } from '@kora/contracts';
import { hoursApi } from '../api/hours.api';
import { exportHourEntries } from '../lib/hours-export';
import { ApiRequestError } from '@/shared/lib/api-client';

const EXPORT_PAGE_SIZE = 200;

/** Pagina `hoursApi.list` hasta traer todos los registros del filtro dado y arma el Excel. */
export function useHourEntriesExport() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const exportEntries = useCallback(async (baseQuery: Omit<Partial<ListHourEntriesQuery>, 'page' | 'pageSize'>) => {
    setExportError(null);
    setExporting(true);
    try {
      const first = await hoursApi.list({ ...baseQuery, page: 1, pageSize: EXPORT_PAGE_SIZE });
      const rest = await Promise.all(
        Array.from({ length: first.pageCount - 1 }, (_, index) =>
          hoursApi.list({ ...baseQuery, page: index + 2, pageSize: EXPORT_PAGE_SIZE }),
        ),
      );
      exportHourEntries([...first.items, ...rest.flatMap((page) => page.items)]);
    } catch (exportErr) {
      setExportError(exportErr instanceof ApiRequestError ? exportErr.message : 'No se pudo generar el Excel.');
    } finally {
      setExporting(false);
    }
  }, []);

  return { exporting, exportError, exportEntries };
}
