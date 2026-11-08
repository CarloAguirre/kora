import { describe, expect, it } from 'vitest';
import type { DriveFolderClient, DriveFolderItem } from '../ports/drive-folder-client.port';
import { ResolveEstimationDriveFolderUseCase } from './resolve-estimation-drive-folder.use-case';

describe('ResolveEstimationDriveFolderUseCase', () => {

  it('Gemini prioriza una subcarpeta de levantamiento real sin inventar IDs', async () => {
    const files = (id: string, name: string, parents: string[] = []): DriveFolderItem => ({
      id, name, parentIds: parents, itemType: 'folder',
      mimeType: 'application/vnd.google-apps.folder',
      modifiedAt: '2026-11-08T10:00:00Z', sizeBytes: null, webViewLink: null,
    });
    const client = files('cliente', 'Abarca Motores');
    const root = files('postventa', 'Postventa', ['cliente']);
    const old = files('cerrado', 'Postventa 2024 (cerrado)', ['cliente']);
    const survey = files('levantamiento', 'Levantamiento app', ['postventa']);
    const metadata = new Map([client, root, old, survey].map((item) =>
      [item.id, item] as const));
    const drive: DriveFolderClient = {
      isConfigured: () => true, listFiles: async () => [],
      searchFolders: async (terms) => terms.some((term) => /postventa/i.test(term))
        ? [root, old] : [client],
      listChildren: async (id) => id === 'cliente' ? [root, old]
        : id === 'postventa' ? [survey] : [],
      getMetadata: async (id) => metadata.get(id) ?? null,
      readAnalysisContent: async () => null,
    };
    const ai = {
      name: 'gemini',
      generateStructured: async () => ({ folderId: 'levantamiento' }),
    };
    const result = await new ResolveEstimationDriveFolderUseCase(drive, ai).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'App de postventa', clientName: 'Abarca Motores',
      documentationLink: null, quotationLink: null,
    });
    expect(result.candidates[0]?.folderId).toBe('levantamiento');
    expect(result.candidates.some((item) => item.folderId === 'cerrado')).toBe(true);
    expect(result.status).toBe('needs_confirmation');
    expect(result.selectedFolder).toBeNull();
    expect(result.candidates[0]?.reasons.join(' ')).toContain('Gemini');
  });



  it('permite buscar con el Drive delegado sin usar la cuenta de servicio por defecto', async () => {
    const inaccessible: DriveFolderClient = {
      isConfigured: () => false, listFiles: async () => [], listChildren: async () => [],
      searchFolders: async () => [], getMetadata: async () => null,
      readAnalysisContent: async () => null,
    };
    const delegated: DriveFolderClient = {
      ...inaccessible, isConfigured: () => true,
      searchFolders: async () => [{
        id: 'levantamiento-app', name: 'Motor de notificaciones',
        mimeType: 'application/vnd.google-apps.folder',
        modifiedAt: '2026-11-08T08:00:00Z', webViewLink: null,
        parentIds: [], sizeBytes: null, itemType: 'folder',
      }],
    };
    const result = await new ResolveEstimationDriveFolderUseCase(inaccessible).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'Motor de notificaciones', clientName: null,
      documentationLink: null, quotationLink: null,
    }, delegated);
    expect(result.status).toBe('resolved');
    expect(result.selectedFolder?.folderId).toBe('levantamiento-app');
  });


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


  it('no inventa carpeta de proyecto si falta la configuración Drive', async () => {
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
      projectName: 'Prospecto cualquiera',
      clientName: 'Cliente',
      documentationLink: null,
      quotationLink: null,
    });

    expect(result.status).toBe('not_found');
    expect(result.connection).toBe('not_configured');
    expect(result.selectedFolder).toBeNull();
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
