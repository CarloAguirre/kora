import { describe, expect, it } from 'vitest';
import type { DriveFolderClient } from '../ports/drive-folder-client.port';
import { ListEstimationDriveFilesUseCase } from './list-estimation-drive-files.use-case';

describe('ListEstimationDriveFilesUseCase', () => {
  it('lista y clasifica archivos visibles en la carpeta', async () => {
    const drive: DriveFolderClient = {
      isConfigured: () => true,
      listFiles: async (folderId) => {
        expect(folderId).toBe('abc_123');
        return [
          {
            id: 'doc-1',
            name: 'Acta de levantamiento.docx',
            mimeType:
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            modifiedAt: '2026-10-20T12:00:00.000Z',
            webViewLink: 'https://drive.google.com/file/d/doc-1/view',
            sizeBytes: 1200,
          },
          {
            id: 'pdf-1',
            name: 'Requerimientos.pdf',
            mimeType: 'application/pdf',
            modifiedAt: '2026-10-19T12:00:00.000Z',
            webViewLink: 'https://drive.google.com/file/d/pdf-1/view',
            sizeBytes: 2200,
          },
        ];
      },
    };

    const result = await new ListEstimationDriveFilesUseCase(drive).execute({
      driveFolderUrl: 'https://drive.google.com/drive/folders/abc_123',
    });

    expect(result.connection).toBe('connected');
    expect(result.files).toHaveLength(2);
    expect(result.files[0]?.kind).toBe('document');
    expect(result.files[1]?.kind).toBe('pdf');
  });

  it('explica cuando Drive no está configurado', async () => {
    const drive: DriveFolderClient = {
      isConfigured: () => false,
      listFiles: async () => [],
    };

    const result = await new ListEstimationDriveFilesUseCase(drive).execute({
      driveFolderUrl: 'https://drive.google.com/drive/folders/abc_123',
    });

    expect(result.connection).toBe('not_configured');
    expect(result.files).toEqual([]);
  });
});
