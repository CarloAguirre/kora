import { describe, expect, it } from 'vitest';
import type {
  DriveFolderClient,
  DriveFolderItem,
} from '../../application/ports/drive-folder-client.port';
import { GoogleDriveDocumentSourceReader } from './google-drive-document-source.reader';
import { describeDocumentCoverage } from '../../application/ports/document-source-reader.port';

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

  const mockDrive = (
    entries: DriveFolderItem[],
    content: (fileId: string, mimeType: string) =>
      Promise<{ mimeType: string; text?: string; dataBase64?: string } | null>,
  ): DriveFolderClient => ({
    isConfigured: () => true,
    listFiles: async () => [],
    listChildren: async (folderId) => folderId === 'root123' ? entries : [],
    searchFolders: async () => [],
    getMetadata: async () => null,
    readAnalysisContent: content,
  });

  it('analiza más de cuatro documentos y distribuye la selección por áreas del alcance', async () => {
    const names = [
      'Requerimientos generales.txt',
      'Historia de usuario solicitudes.txt',
      'Matriz de aprobacion.txt',
      'Integracion con ERP.txt',
      'Prototipo Figma.txt',
      'Arquitectura plataforma.txt',
      'Roadmap desarrollo.txt',
      'Minuta reuniones.txt',
      'Reglas de negocio.txt',
    ];
    const drive = mockDrive(names.map((name, i) =>
      file('source-' + i, name, 'text/plain')),
    async (id, mimeType) => ({ mimeType, text: 'Contenido de ' + id }));
    const reader = new GoogleDriveDocumentSourceReader(drive);
    const result = await reader.readDriveSourcesWithCoverage(
      'https://drive.google.com/drive/folders/root123',
    );
    expect(result.documents).toHaveLength(9);
    expect(new Set(result.documents.map((doc) => doc.sourceId)).size).toBe(9);
    expect(result.coverage?.omitted).toHaveLength(0);
    expect(result.coverage?.analyzedDocuments).toBe(9);
  });

  it('no deja que 22 documentos de requisitos oculten la matriz, integraciones y prototipo', async () => {
    const manyRequirements = Array.from({ length: 22 }, (_, i) =>
      file('req-' + i, 'Requerimientos funcionales ' + i + '.txt', 'text/plain'));
    const drive = mockDrive([
      ...manyRequirements,
      file('rules', 'Matriz de aprobacion.txt', 'text/plain'),
      file('sap', 'Integracion SAP.txt', 'text/plain'),
      file('design', 'Prototipo Figma.txt', 'text/plain'),
    ], async (id, mimeType) => ({ mimeType, text: id + ' - contenido' }));
    const reader = new GoogleDriveDocumentSourceReader(drive);
    const result = await reader.readDriveSourcesWithCoverage(
      'https://drive.google.com/drive/folders/root123',
    );
    const ids = result.documents.map((doc) => doc.sourceId);
    expect(ids).toHaveLength(18);
    expect(ids).toContain('rules');
    expect(ids).toContain('sap');
    expect(ids).toContain('design');
    expect(result.coverage?.eligibleDocuments).toBe(25);
    expect(result.coverage?.omitted).toHaveLength(7);
    expect(describeDocumentCoverage(result.coverage)).toContain('COBERTURA DOCUMENTAL PARCIAL');
  });

  it('preserva documentos de más de 30.000 caracteres sin recorte silencioso', async () => {
    const complete = 'A'.repeat(45_000) + 'FIN DE LOS REQUISITOS';
    const drive = mockDrive([
      file('large', 'Requerimientos extensos.txt', 'text/plain'),
    ], async (_, mimeType) => ({ mimeType, text: complete }));
    const reader = new GoogleDriveDocumentSourceReader(drive);
    const result = await reader.readDriveSourcesWithCoverage(
      'https://drive.google.com/drive/folders/root123',
    );
    expect(result.documents[0]?.text).toBe(complete);
    expect(result.coverage?.omitted).toHaveLength(0);
  });

  it('reporta archivos grandes o descartados por presupuesto; jamás usa fragmentos invisibles', async () => {
    const drive = mockDrive([
      file('a', 'Requerimientos A.txt', 'text/plain'),
      file('b', 'Requerimientos B.txt', 'text/plain'),
      file('c', 'Requerimientos C.txt', 'text/plain'),
      file('d', 'Requerimientos D.txt', 'text/plain'),
    ], async (id, mimeType) => ({
      mimeType,
      text: id === 'd' ? 'D'.repeat(170_000) : id.toUpperCase().repeat(140_000),
    }));
    const reader = new GoogleDriveDocumentSourceReader(drive);
    const result = await reader.readDriveSourcesWithCoverage(
      'https://drive.google.com/drive/folders/root123',
    );
    expect(result.documents).toHaveLength(2);
    expect(result.documents.every((doc) => doc.text?.length === 140_000)).toBe(true);
    expect(result.coverage?.omitted).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'Requerimientos C.txt', reason: expect.stringContaining('presupuesto') }),
      expect.objectContaining({ path: 'Requerimientos D.txt', reason: expect.stringContaining('no se recorta') }),
    ]));
  });

  it('continúa con otras fuentes si un documento no se puede leer y registra la omisión', async () => {
    const drive = mockDrive([
      file('unreadable', 'Requerimientos no legibles.txt', 'text/plain'),
      file('good', 'Matriz de reglas.txt', 'text/plain'),
    ], async (id, mimeType) => {
      if (id === 'unreadable') throw new Error('Permiso denegado');
      return { mimeType, text: 'Reglas revisables' };
    });
    const reader = new GoogleDriveDocumentSourceReader(drive);
    const result = await reader.readDriveSourcesWithCoverage(
      'https://drive.google.com/drive/folders/root123',
    );
    expect(result.documents.map((doc) => doc.sourceId)).toEqual(['good']);
    expect(result.coverage?.omitted).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'Requerimientos no legibles.txt' }),
    ]));
  });

  it('advierte cuando el recorrido de Drive supera el límite de exploración', async () => {
    const many = Array.from({ length: 260 }, (_, i) =>
      file('doc-' + i, 'Minuta ' + i + '.txt', 'text/plain'));
    const drive = mockDrive(many, async (id, mimeType) =>
      ({ mimeType, text: id }));
    const reader = new GoogleDriveDocumentSourceReader(drive);
    const result = await reader.readDriveSourcesWithCoverage(
      'https://drive.google.com/drive/folders/root123',
    );
    expect(result.coverage?.scannedItems).toBe(250);
    expect(result.coverage?.scanTruncated).toBe(true);
    expect(describeDocumentCoverage(result.coverage)).toContain('límite de exploración');
  });

  it('con carpeta compartida encuentra PDFs en raíz/subcarpeta y explica por qué no procesa XLSX', async () => {
    const folder = (id: string, name: string): DriveFolderItem => ({
      id, name, mimeType: 'application/vnd.google-apps.folder',
      modifiedAt: '2026-09-16T10:00:00.000Z', webViewLink: null,
      sizeBytes: null, itemType: 'folder', parentIds: ['root123'],
    });
    const pdf = (id: string, name: string): DriveFolderItem =>
      file(id, name, 'application/pdf');
    const drive: DriveFolderClient = {
      isConfigured: () => true, listFiles: async () => [],
      searchFolders: async () => [], getMetadata: async () => null,
      listChildren: async (id) => id === 'root123' ? [
        folder('fichas', 'Fichas Protocolo'),
        pdf('protocol', '1.10 Protocolo Relocalización.pdf'),
        file('gantt', 'Cronograma Gantt.xlsx',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      ] : id === 'fichas'
        ? [pdf('ficha', 'Ficha de levantamiento.pdf')] : [],
      readAnalysisContent: async (id, mime) =>
        ({ mimeType: mime, dataBase64: id === 'protocol' ? 'cGRmMQ==' : 'cGRmMg==' }),
    };
    const result = await new GoogleDriveDocumentSourceReader(drive)
      .readDriveSourcesWithCoverage('https://drive.google.com/drive/folders/root123');
    expect(result.documents.map((doc) => doc.name)).toEqual([
      'Ficha de levantamiento.pdf', '1.10 Protocolo Relocalización.pdf',
    ]);
    expect(result.coverage?.scannedItems).toBe(4);
    expect(result.coverage?.eligibleDocuments).toBe(2);
    expect(result.coverage?.omitted).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'Cronograma Gantt.xlsx',
        reason: 'formato no compatible con el lector' }),
    ]));
  });

  it('si falla la lectura de PDF informa el motivo sin ocultar otro PDF válido', async () => {
    const drive = mockDrive([
      file('blocked', 'Requerimiento protegido.pdf', 'application/pdf'),
      file('readable', 'Alcance del proyecto.pdf', 'application/pdf'),
    ], async (id) => {
      if (id === 'blocked') throw new Error('Google Drive rechazó la consulta (HTTP 403).');
      return { mimeType: 'application/pdf', dataBase64: 'cGRm' };
    });
    const result = await new GoogleDriveDocumentSourceReader(drive)
      .readDriveSourcesWithCoverage('https://drive.google.com/drive/folders/root123');
    expect(result.documents).toHaveLength(1);
    expect(result.coverage?.omitted).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'Requerimiento protegido.pdf',
        reason: expect.stringContaining('HTTP 403'),
      }),
    ]));
  });

  it('si una subcarpeta está bloqueada no cancela la lectura del resto', async () => {
    const folder: DriveFolderItem = {
      ...file('denied', 'Fichas Protocolo',
        'application/vnd.google-apps.folder'), itemType: 'folder',
    };
    const drive = mockDrive([
      folder, file('ok', 'Alcance general.pdf', 'application/pdf'),
    ], async (_id, mime) => ({ mimeType: mime, dataBase64: 'cGRm' }));
    drive.listChildren = async (id) => {
      if (id === 'root123') return [folder, file('ok', 'Alcance general.pdf', 'application/pdf')];
      throw new Error('Google Drive rechazó la consulta (HTTP 403).');
    };
    const result = await new GoogleDriveDocumentSourceReader(drive)
      .readDriveSourcesWithCoverage('https://drive.google.com/drive/folders/root123');
    expect(result.documents).toHaveLength(1);
    expect(result.coverage?.omitted).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'Fichas Protocolo',
        reason: expect.stringContaining('HTTP 403') }),
    ]));
  });

});
