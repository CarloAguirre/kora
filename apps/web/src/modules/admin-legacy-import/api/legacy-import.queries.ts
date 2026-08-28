import { useMutation } from '@tanstack/react-query';
import { legacyImportApi } from './legacy-import.api';

export function useRunLegacyImport() {
  return useMutation({
    mutationFn: ({ file, dryRun }: { file: File; dryRun: boolean }) => legacyImportApi.run(file, dryRun),
  });
}
