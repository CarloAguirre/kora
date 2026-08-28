import type { LegacyImportResponse } from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

/**
 * Llamadas HTTP del importador de datos legacy por archivo.
 *
 * `dryRun=true` corre todo el pipeline (reemplazo + poda) dentro de una
 * transacción que se revierte al final — la vista previa nunca escribe nada.
 * `dryRun=false` es la confirmación real.
 */
export const legacyImportApi = {
  run(file: File, dryRun: boolean): Promise<LegacyImportResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return api.postFormData<LegacyImportResponse>('/admin/legacy-import', formData, { dryRun });
  },
};
