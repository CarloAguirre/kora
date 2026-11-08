import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleDriveFolderClient } from './google-drive-folder.client';

afterEach(() => vi.unstubAllGlobals());

describe('GoogleDriveFolderClient · paginación de carpetas compartidas', () => {
  it('consulta todas las páginas y conserva los PDF fuera de la primera', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        nextPageToken: 'page2',
        files: [{ id: 'folder1', name: 'Fichas Protocolo',
          mimeType: 'application/vnd.google-apps.folder',
          modifiedTime: '2026-11-01T12:00:00Z' }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        files: [{ id: 'pdf2', name: 'Levantamiento.pdf', mimeType: 'application/pdf',
          modifiedTime: '2026-11-01T12:00:00Z', size: '20000' }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new GoogleDriveFolderClient({ googleDrive: { enabled: false } } as never,
      'token-del-usuario');
    const result = await client.listChildren('carpeta-compartida');
    expect(result.map((item) => item.name)).toEqual([
      'Fichas Protocolo', 'Levantamiento.pdf',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(secondUrl.searchParams.get('pageToken')).toBe('page2');
    expect(secondUrl.searchParams.get('supportsAllDrives')).toBe('true');
    expect(secondUrl.searchParams.get('includeItemsFromAllDrives')).toBe('true');
  });

  it('un error HTTP de Drive no se interpreta como carpeta vacía', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('Forbidden', { status: 403 })));
    const client = new GoogleDriveFolderClient({ googleDrive: { enabled: false } } as never,
      'token-del-usuario');
    await expect(client.listChildren('carpeta-protegida')).rejects.toThrow(
      'Kora no tiene permiso');
  });
});
