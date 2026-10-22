import { describe, expect, it } from 'vitest';
import type {
  DriveFolderClient,
  DriveFolderItem,
} from '../../application/ports/drive-folder-client.port';
import { GoogleDriveDocumentSourceReader } from './google-drive-document-source.reader';

function file(
  id: string,
  name: string,
  mimeType: string,
): DriveFolderItem {
  return {
    id,
    name,
    mimeType,
    modifiedAt: '2026-10-21T12:00:00.000Z',
    webViewLink: `https://drive.google.com/file/d/${id}/view`,
    sizeBytes: 1000,
    itemType: 'file',
    parentIds: ['root123'],
  };
}

describe('GoogleDriveDocumentSourceReader', () => {
  it('prioriza antecedentes relevantes y omite credenciales y Office no convertido', async () => {
    const drive: DriveFolderClient = {
      isConnected: async () => true,
      listFiles: async () => [],
      searchFolders: async () => [],
      getMetadata: async () => null,
      readAnalysisContent: async (_userId, fileId, mimeType) => {
        if (fileId === 'requirements') {
          return { mimeType, dataBase64: 'cGRm' };
        }
        if (fileId === 'notes') {
          return { mimeType, text: 'Notas generales del proyecto.' };
        }
        return null;
      },
      listChildren: async (_userId, folderId) => {
        if (folderId !== 'root123') return [];
        return [
          file(
            'requirements',
            'Requerimientos funcionales.pdf',
            'application/pdf',
          ),
          file('notes', 'Minuta cliente.txt', 'text/plain'),
          file(
            'access',
            'Acceso.xlsx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ),
          file(
            'office',
            'Alcance.docx',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          ),
        ];
      },
    };

    const reader = new GoogleDriveDocumentSourceReader(drive);
    const result = await reader.readDriveSources(
      'user-1',
      'https://drive.google.com/drive/folders/root123',
    );

    expect(result.map((document) => document.name)).toEqual([
      'Requerimientos funcionales.pdf',
      'Minuta cliente.txt',
    ]);
    expect(result[0]?.dataBase64).toBe('cGRm');
    expect(result[1]?.text).toContain('Notas generales');
  });
});
