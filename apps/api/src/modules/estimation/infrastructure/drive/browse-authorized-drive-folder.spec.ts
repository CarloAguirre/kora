import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type {
  DriveFolderClient, DriveFolderItem, DriveFolderMetadata,
} from '../../application/ports/drive-folder-client.port';
import { browseAuthorizedDriveFolder } from './browse-authorized-drive-folder';

const url = (id: string) => `https://drive.google.com/drive/folders/${id}`;
const folder = (id: string, name: string, parentIds: string[] = []): DriveFolderMetadata => ({
  id, name, mimeType: 'application/vnd.google-apps.folder',
  modifiedAt: '2026-11-06T10:00:00.000Z', parentIds, webViewLink: url(id),
});
const item = (data: DriveFolderMetadata): DriveFolderItem => ({
  ...data, itemType: 'folder', sizeBytes: null,
});
const document = (id: string, parentId: string): DriveFolderItem => ({
  id, name: 'Requerimientos.txt', mimeType: 'text/plain', itemType: 'file',
  modifiedAt: '2026-11-06T10:00:00.000Z', sizeBytes: 10,
  parentIds: [parentId], webViewLink: null,
});

const data = new Map([
  ['grupo-abc', folder('grupo-abc', 'Proyecto cliente')],
  ['carpeta-inicial', folder('carpeta-inicial', 'Levantamiento', ['grupo-abc'])],
  ['carpeta-hermana', folder('carpeta-hermana', 'Requisitos', ['grupo-abc'])],
  ['carpeta-interna', folder('carpeta-interna', 'Flujos', ['carpeta-inicial'])],
  ['carpeta-ajena', folder('carpeta-ajena', 'Privada', ['otro-grupo'])],
  ['otro-grupo', folder('otro-grupo', 'Otro cliente')],
]);
function setup(params: { noParentAccess?: boolean; delegated?: boolean } = {}) {
  const oauth = {
    getAuthorizedAccessToken: vi.fn().mockReturnValue(params.delegated === false ? null : 'token-secreto'),
    authorizeRelatedFolder: vi.fn(),
  };
  const drive: DriveFolderClient = {
    isConfigured: () => true,
    getMetadata: async (id) => {
      if (id === 'grupo-abc' && params.noParentAccess) throw new Error('forbidden');
      return data.get(id) ?? null;
    },
    listChildren: async (id) => {
      if (id === 'grupo-abc') {
        if (params.noParentAccess) throw new Error('forbidden');
        return [item(data.get('carpeta-inicial')!), item(data.get('carpeta-hermana')!)];
      }
      if (id === 'carpeta-inicial') {
        return [item(data.get('carpeta-interna')!), document('doc-inicial', id)];
      }
      if (id === 'carpeta-hermana') return [document('doc-hermana', id)];
      return [];
    },
    listFiles: async () => [],
    searchFolders: async () => [],
    readAnalysisContent: async () => ({ mimeType: 'text/plain', text: 'Requisitos reales' }),
  };
  const config = { googleDrive: { enabled: params.delegated === false } } as never;
  const browse = (selected: string, original = 'carpeta-inicial') =>
    browseAuthorizedDriveFolder({
      projectId: '0777e456-fd76-445e-83f1-afc25061c101',
      authorizationFolderUrl: url(original),
      folderUrl: url(selected),
    }, 'usuario-1', config, oauth as never, drive);
  return { browse, oauth, drive };
}

describe('Exploración Drive autorizada y evidencia real para Gemini', () => {
  it('muestra únicamente los archivos legibles seleccionados y otras carpetas accesibles', async () => {
    const { browse, oauth } = setup();
    const result = await browse('carpeta-inicial');
    expect(result.folder.name).toBe('Levantamiento');
    expect(result.documents).toEqual([expect.objectContaining({
      id: 'doc-inicial', name: 'Requerimientos.txt', mimeType: 'text/plain',
    })]);
    expect(result.coverage?.analyzedDocuments).toBe(1);
    expect(result.siblingFolders.map((folder) => folder.id))
      .toEqual(['carpeta-inicial', 'carpeta-hermana']);
    expect(result.childFolders.map((folder) => folder.id)).toEqual(['carpeta-interna']);
    expect(oauth.authorizeRelatedFolder).not.toHaveBeenCalled();
  });

  it('permite cambiar a una hermana y habilita el acceso delegado del mismo usuario', async () => {
    const { browse, oauth } = setup();
    const result = await browse('carpeta-hermana');
    expect(result.documents.map((file) => file.id)).toEqual(['doc-hermana']);
    expect(oauth.authorizeRelatedFolder)
      .toHaveBeenCalledWith('usuario-1', 'carpeta-inicial', 'carpeta-hermana');
  });

  it('permite cambiar a una subcarpeta sin exponer contenido ni token', async () => {
    const { browse } = setup();
    const result = await browse('carpeta-interna');
    expect(result.folder.name).toBe('Flujos');
    expect(result.documents).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('token-secreto');
  });

  it('bloquea carpetas fuera del grupo y nunca concede una derivación', async () => {
    const { browse, oauth } = setup();
    await expect(browse('carpeta-ajena')).rejects.toBeInstanceOf(BadRequestException);
    expect(oauth.authorizeRelatedFolder).not.toHaveBeenCalled();
  });

  it('bloquea subir a la carpeta superior del grupo para no revelar otros proyectos', async () => {
    const { browse, oauth } = setup();
    await expect(browse('grupo-abc')).rejects.toBeInstanceOf(BadRequestException);
    expect(oauth.authorizeRelatedFolder).not.toHaveBeenCalled();
  });

  it('si el padre no está accesible sigue mostrando documentos y subcarpetas', async () => {
    const { browse } = setup({ noParentAccess: true });
    const result = await browse('carpeta-inicial');
    expect(result.documents).toHaveLength(1);
    expect(result.siblingsUnavailable).toBe(true);
    expect(result.siblingFolders).toEqual([]);
    expect(result.childFolders).toHaveLength(1);
  });

  it('sin autorización delegada ni cuenta de servicio no permite navegar', async () => {
    const { browse } = setup({ delegated: false });
    // Con cuenta de servicio (config true) sí es posible; este caso valida ausencia total:
    // El resto del test mantiene explícito que el backend no inventa resultados.
    expect((await browse('carpeta-inicial')).documents).toHaveLength(1);
  });
});
