import { describe, expect, it } from 'vitest';
import type { DriveFolderClient } from '../ports/drive-folder-client.port';
import { ResolveEstimationDriveFolderUseCase } from './resolve-estimation-drive-folder.use-case';

describe('ResolveEstimationDriveFolderUseCase', () => {
  it('usa documentationLink como vínculo explícito cuando existe', async () => {
    const drive: DriveFolderClient = {
      isConfigured: () => false,
      listFiles: async () => [],
      listChildren: async () => [],
      searchFolders: async () => [],
      getMetadata: async () => null,
      readAnalysisContent: async () => null,
    };

    const result = await new ResolveEstimationDriveFolderUseCase(drive).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'AurelIA',
      clientName: 'Goldfields',
      documentationLink:
        'https://drive.google.com/drive/folders/1hkIStIEJSSDtBJigvlU5dg_PnXsmrc4P',
      quotationLink: null,
    });

    expect(result.status).toBe('resolved');
    expect(result.selectedFolder?.folderId).toBe(
      '1hkIStIEJSSDtBJigvlU5dg_PnXsmrc4P',
    );
    expect(result.selectedFolder?.score).toBe(100);
  });

  it('resuelve automáticamente una carpeta con nombre exacto', async () => {
    const drive: DriveFolderClient = {
      isConfigured: () => true,
      listFiles: async () => [],
      listChildren: async () => [],
      searchFolders: async (terms) =>
        terms.some((term) => term.toLowerCase().includes('aurelia'))
          ? [
              {
                id: 'folder-aurelia',
                name: 'AurelIA',
                mimeType: 'application/vnd.google-apps.folder',
                modifiedAt: '2026-10-21T12:00:00.000Z',
                webViewLink:
                  'https://drive.google.com/drive/folders/folder-aurelia',
                sizeBytes: null,
                itemType: 'folder',
                parentIds: [],
              },
            ]
          : [],
      getMetadata: async () => null,
      readAnalysisContent: async () => null,
    };

    const result = await new ResolveEstimationDriveFolderUseCase(drive).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'AurelIA',
      clientName: 'Goldfields',
      documentationLink: null,
      quotationLink: null,
    });

    expect(result.status).toBe('resolved');
    expect(result.selectedFolder?.name).toBe('AurelIA');
    expect(result.selectedFolder?.confidence).toBe('high');
  });
});
