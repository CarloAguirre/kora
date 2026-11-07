import { BadRequestException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAuthorizedDriveReader } from './resolve-authorized-drive-reader';

const folder = 'https://drive.google.com/drive/folders/carpeta-real-123';
const config = { googleDrive: { enabled: false } } as never;
afterEach(() => vi.unstubAllGlobals());

describe('resolveAuthorizedDriveReader · usuario y carpeta vinculados', () => {
  it('requiere autorización para carpetas reales sin cuenta de servicio', () => {
    const oauth = { getAuthorizedAccessToken: vi.fn().mockReturnValue(null) };
    expect(() => resolveAuthorizedDriveReader(folder, 'usuario-1', config, oauth as never))
      .toThrow(BadRequestException);
    expect(oauth.getAuthorizedAccessToken).toHaveBeenCalledWith('usuario-1', 'carpeta-real-123');
  });

  it('usa token delegado solo cuando pertenece al usuario y carpeta y lee contenido real', async () => {
    const oauth = { getAuthorizedAccessToken: vi.fn((user: string, id: string) =>
      user === 'usuario-1' && id === 'carpeta-real-123' ? 'token-delegado' : null) };
    expect(() => resolveAuthorizedDriveReader(folder, 'usuario-2', config, oauth as never))
      .toThrow(BadRequestException);
    const reader = resolveAuthorizedDriveReader(folder, 'usuario-1', config, oauth as never);
    const google = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [{
        id: 'doc1', name: 'Requerimientos.txt', mimeType: 'text/plain',
        modifiedTime: '2026-11-05T12:00:00Z', parents: ['carpeta-real-123'],
      }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response('Requerimientos reales de cliente.', { status: 200 }));
    vi.stubGlobal('fetch', google);
    const docs = await reader!.readDriveSources(folder);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      sourceId: 'doc1', name: 'Requerimientos.txt',
      text: 'Requerimientos reales de cliente.',
    });
    expect(google).toHaveBeenCalledTimes(2);
    for (const call of google.mock.calls) {
      expect(call[1].headers.Authorization).toBe('Bearer token-delegado');
    }
  });

  it('permite usar lector de cuenta de servicio cuando está configurada', () => {
    const result = resolveAuthorizedDriveReader(folder, 'usuario-1',
      { googleDrive: { enabled: true } } as never,
      { getAuthorizedAccessToken: vi.fn().mockReturnValue(null) } as never);
    expect(result).toBeUndefined();
  });

  it('no permite URL ajena a Google Drive', () => {
    expect(() => resolveAuthorizedDriveReader('https://evil.example/folders/abc', 'usuario-1', config))
      .toThrow(BadRequestException);
  });
});
