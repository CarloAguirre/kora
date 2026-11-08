import { describe, expect, it } from 'vitest';
import type { DriveFolderClient, DriveFolderItem } from '../ports/drive-folder-client.port';
import { ResolveEstimationDriveFolderUseCase } from './resolve-estimation-drive-folder.use-case';

describe('ResolveEstimationDriveFolderUseCase', () => {


  it('descarta carpeta homónima vacía y recomienda la que contiene PDFs anidados', async () => {
    const folder = (id: string, parentIds: string[] = []): DriveFolderItem => ({
      id, name: '03.Documento de levantamiento detallado',
      mimeType: 'application/vnd.google-apps.folder', itemType: 'folder',
      modifiedAt: '2026-11-08T10:00:00Z', webViewLink: null,
      sizeBytes: null, parentIds,
    });
    const empty = folder('id-vacio');
    const filled = folder('id-con-documentos');
    const child = { ...folder('fichas', ['id-con-documentos']), name: 'Fichas Protocolo' };
    const pdf: DriveFolderItem = {
      ...folder('pdf-real', ['fichas']),
      name: 'Levantamiento y requisitos.pdf', mimeType: 'application/pdf',
      itemType: 'file', sizeBytes: 180_000,
    };
    const drive: DriveFolderClient = {
      isConfigured: () => true, listFiles: async () => [],
      searchFolders: async () => [empty, filled],
      getMetadata: async () => null, readAnalysisContent: async () => null,
      listChildren: async (id) => id === 'id-vacio' ? [] :
        id === 'id-con-documentos' ? [child] : id === 'fichas' ? [pdf] : [],
    };
    const result = await new ResolveEstimationDriveFolderUseCase(drive).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: '03.Documento de levantamiento detallado',
      clientName: null, documentationLink: null, quotationLink: null,
    });
    expect(result.candidates.map((c) => c.folderId)).toEqual(['id-con-documentos']);
    expect(result.selectedFolder?.folderId).toBe('id-con-documentos');
    expect(result.candidates[0]?.reasons.join(' ')).toContain('verificó documentos');
  });

  it('no sugiere carpetas vacías ni carpetas que solo contienen XLSX', async () => {
    const folder = (id: string): DriveFolderItem => ({
      id, name: 'Documentación Portal PDC',
      mimeType: 'application/vnd.google-apps.folder', itemType: 'folder',
      modifiedAt: '2026-11-08T10:00:00Z', webViewLink: null,
      sizeBytes: null, parentIds: [],
    });
    const drive: DriveFolderClient = {
      isConfigured: () => true, listFiles: async () => [],
      searchFolders: async () => [folder('sin-archivos'), folder('solo-xlsx')],
      getMetadata: async () => null, readAnalysisContent: async () => null,
      listChildren: async (id) => id === 'solo-xlsx' ? [{
        ...folder('excel'), name: 'Cronograma.xlsx', itemType: 'file',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }] : [],
    };
    const result = await new ResolveEstimationDriveFolderUseCase(drive).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'Documentación Portal PDC', clientName: null,
      documentationLink: null, quotationLink: null,
    });
    expect(result.status).toBe('not_found');
    expect(result.selectedFolder).toBeNull();
    expect(result.candidates).toEqual([]);
    expect(result.message).toContain('vacías');
  });

  it('si Drive rechaza explorar una carpeta no la confunde con carpeta vacía', async () => {
    const drive: DriveFolderClient = {
      isConfigured: () => true, listFiles: async () => [],
      searchFolders: async () => [{
        id: 'restringida', name: 'Levantamiento PDC',
        mimeType: 'application/vnd.google-apps.folder',
        modifiedAt: '2026-11-08T10:00:00Z', webViewLink: null,
        sizeBytes: null, itemType: 'folder', parentIds: [],
      }],
      getMetadata: async () => null, readAnalysisContent: async () => null,
      listChildren: async () => { throw new Error('HTTP 403'); },
    };
    const result = await new ResolveEstimationDriveFolderUseCase(drive).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'Levantamiento PDC', clientName: null,
      documentationLink: null, quotationLink: null,
    });
    expect(result.status).toBe('not_found');
    expect(result.candidates).toEqual([]);
    expect(result.message).toContain('no se pudo verificar');
  });

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
        : id === 'postventa' ? [survey]
          : id === 'levantamiento' ? [{
              id: 'requisitos', name: 'Requerimientos del cliente.pdf',
              mimeType: 'application/pdf', modifiedAt: '2026-11-08T10:00:00Z',
              webViewLink: null, sizeBytes: 20000, parentIds: ['levantamiento'],
              itemType: 'file' as const,
            }] : [],
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
    expect(result.candidates.some((item) => item.folderId === 'cerrado')).toBe(false);
    expect(result.candidates.every((item) => item.reasons.some((reason) =>
      reason.includes('verificó documentos')))).toBe(true);
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
      listChildren: async (id) => id === 'levantamiento-app' ? [{
        id: 'documento-1', name: 'Especificación funcional.pdf',
        mimeType: 'application/pdf', itemType: 'file' as const,
        modifiedAt: '2026-11-08T08:00:00Z', webViewLink: null,
        sizeBytes: 20000, parentIds: ['levantamiento-app'],
      }] : [],
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
      listChildren: async (id) => id === 'folder-aurelia' ? [{
        id: 'aurelia-doc', name: 'Alcance.pdf', mimeType: 'application/pdf',
        itemType: 'file' as const, modifiedAt: '2026-11-08T08:00:00Z',
        webViewLink: null, sizeBytes: 20000, parentIds: ['folder-aurelia'],
      }] : [],
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
