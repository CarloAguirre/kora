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

  it('entrega el contenido KDM a Gemini si Drive no está configurado', async () => {
    const drive: DriveFolderClient = {
      isConfigured: () => false,
      listFiles: async () => [],
      listChildren: async () => [],
      searchFolders: async () => [],
      getMetadata: async () => null,
      readAnalysisContent: async () => null,
    };

    const reader = new GoogleDriveDocumentSourceReader(drive);
    const result = await reader.readDriveSources(
      'https://drive.google.com/drive/folders/kora-poc-fallback',
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Requerimiento_KDM.pdf');
    expect(result[0]?.text).toContain('Integración con Facele');
    expect(result[0]?.text).toContain('Match Engine');
    expect(result[0]?.text).toContain('Microsoft Entra ID');
  });

  it('selecciona KDM por su ID aunque existan credenciales Drive y no llama a Drive real', async () => {
    let usedDrive = false;
    const drive: DriveFolderClient = {
      isConfigured: () => true,
      listFiles: async () => { usedDrive = true; return []; },
      listChildren: async () => { usedDrive = true; return []; },
      searchFolders: async () => { usedDrive = true; return []; },
      getMetadata: async () => { usedDrive = true; return null; },
      readAnalysisContent: async () => { usedDrive = true; return null; },
    };
    const reader = new GoogleDriveDocumentSourceReader(drive);
    const docs = await reader.readDriveSources(
      'https://drive.google.com/drive/folders/kora-poc-fallback',
    );
    expect(docs).toHaveLength(1);
    expect(docs[0]?.name).toBe('Requerimiento_KDM.pdf');
    expect(usedDrive).toBe(false);
  });

  it('no sustituye silenciosamente otro proyecto por el PDF KDM de demostración', async () => {
    const drive: DriveFolderClient = {
      isConfigured: () => false,
      listFiles: async () => [],
      listChildren: async () => [],
      searchFolders: async () => [],
      getMetadata: async () => null,
      readAnalysisContent: async () => null,
    };
    const reader = new GoogleDriveDocumentSourceReader(drive);
    await expect(reader.readDriveSources(
      'https://drive.google.com/drive/folders/proyecto-real',
    )).rejects.toThrow(/Google Drive no está configurado/);
  });

  it('prioriza antecedentes relevantes y omite credenciales y Office no convertido', async () => {
    const drive: DriveFolderClient = {
      isConfigured: () => true,
      listFiles: async () => [],
      searchFolders: async () => [],
      getMetadata: async () => null,
      readAnalysisContent: async (fileId, mimeType) => {
        if (fileId === 'requirements') {
          return { mimeType, dataBase64: 'cGRm' };
        }
        if (fileId === 'notes') {
          return { mimeType, text: 'Notas generales del proyecto.' };
        }
        return null;
      },
      listChildren: async (folderId) => {
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
