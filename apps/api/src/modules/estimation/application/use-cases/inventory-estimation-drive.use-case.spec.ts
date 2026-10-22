import { describe, expect, it } from 'vitest';
import type { DriveFolderClient } from '../ports/drive-folder-client.port';
import { InventoryEstimationDriveUseCase } from './inventory-estimation-drive.use-case';

describe('InventoryEstimationDriveUseCase', () => {

  it('expone Requerimiento_KDM.pdf cuando Drive no está configurado', async () => {
    const drive: DriveFolderClient = {
      isConfigured: () => false,
      listFiles: async () => [],
      listChildren: async () => [],
      searchFolders: async () => [],
      getMetadata: async () => null,
      readAnalysisContent: async () => null,
    };

    const result = await new InventoryEstimationDriveUseCase(drive).execute({
      driveFolderUrl:
        'https://drive.google.com/drive/folders/kora-poc-fallback',
      maxDepth: 3,
    });

    expect(result.connection).toBe('connected');
    expect(result.summary.files).toBe(1);
    expect(result.items[0]?.name).toBe('Requerimiento_KDM.pdf');
    expect(result.items[0]?.kind).toBe('pdf');
    expect(result.items[0]?.analyzable).toBe(true);
  });

  it('prioriza levantamientos y excluye credenciales', async () => {
    const drive: DriveFolderClient = {
      isConfigured: () => true,
      listFiles: async () => [],
      searchFolders: async () => [],
      getMetadata: async () => null,
      readAnalysisContent: async () => null,
      listChildren: async (folderId) => {
        if (folderId !== 'root123') return [];
        return [
          {
            id: 'requirements',
            name: 'Requerimientos funcionales.pdf',
            mimeType: 'application/pdf',
            modifiedAt: '2026-10-20T12:00:00.000Z',
            webViewLink: 'https://drive.google.com/file/d/requirements/view',
            sizeBytes: 500,
            itemType: 'file',
            parentIds: ['root123'],
          },
          {
            id: 'access',
            name: 'Acceso.xlsx',
            mimeType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            modifiedAt: '2026-10-19T12:00:00.000Z',
            webViewLink: null,
            sizeBytes: 500,
            itemType: 'file',
            parentIds: ['root123'],
          },
        ];
      },
    };

    const result = await new InventoryEstimationDriveUseCase(drive).execute({
      driveFolderUrl: 'https://drive.google.com/drive/folders/root123',
      maxDepth: 3,
    });

    expect(result.summary.recommended).toBe(1);
    expect(result.summary.excluded).toBe(1);
    expect(result.items.find((item) => item.id === 'requirements')?.priority).toBe(
      'recommended',
    );
    expect(result.items.find((item) => item.id === 'access')?.priority).toBe(
      'excluded',
    );
  });
});
