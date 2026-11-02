import { describe, expect, it } from 'vitest';
import { estimationPocProposalSchema } from '@kora/contracts';
import type { AiProvider } from '../../../ai/application/ports/ai-provider.port';
import type { DocumentSourceReader } from '../ports/document-source-reader.port';
import type { DriveFolderClient } from '../ports/drive-folder-client.port';
import { GoogleDriveDocumentSourceReader } from '../../infrastructure/drive/google-drive-document-source.reader';
import { GenerateEstimationPocProposalUseCase } from './generate-estimation-poc-proposal.use-case';

describe('GenerateEstimationPocProposalUseCase', () => {
  it('calcula las HH fuera del proveedor IA', async () => {
    const ai: AiProvider = {
      name: 'poc-ai',
      generateStructured: async () => ({
        summary: 'Propuesta',
        roles: [
          {
            role: 'Desarrollador',
            unit: 'week',
            duration: 2,
            hoursPerUnit: 40,
            people: 2,
            source: 'Fuente PoC',
          },
          {
            role: 'QA',
            unit: 'day',
            duration: 3,
            hoursPerUnit: 8,
            people: 1,
            source: 'Fuente PoC',
          },
        ],
        assumptions: ['Supuesto'],
        clarifyingQuestions: ['Pregunta'],
      }),
    };
    const sources: DocumentSourceReader = {
      readDriveSources: async () => [],
    };

    const result = await new GenerateEstimationPocProposalUseCase(
      ai,
      sources,
    ).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'Proyecto',
      clientName: 'Cliente',
      driveFolderUrl: 'https://drive.google.com/drive/folders/demo',
      instructions: null,
      answers: [],
    });

    expect(result.roles[0]?.totalHours).toBe(160);
    expect(result.roles[1]?.totalHours).toBe(24);
    expect(result.totalHours).toBe(184);
    expect(result.sourceMode).toBe('poc_simulated');
    expect(result.documentsAnalyzed).toBe(0);
  });


  it('usa Requerimiento_KDM.pdf con Gemini mientras Drive no está configurado', async () => {
    let receivedDocumentName: string | null = null;
    let receivedDocumentText = '';

    const ai: AiProvider = {
      name: 'gemini',
      generateStructured: async (request) => {
        receivedDocumentName = request.documents?.[0]?.name ?? null;
        receivedDocumentText = request.documents?.[0]?.text ?? '';

        return {
          summary: 'Estimación generada desde KDM',
          roles: [
            {
              role: 'Desarrollador Fullstack',
              unit: 'week',
              duration: 4,
              hoursPerUnit: 40,
              people: 1,
              source: 'Requerimiento_KDM.pdf',
            },
          ],
          assumptions: [],
          clarifyingQuestions: [],
        };
      },
    };

    const drive: DriveFolderClient = {
      isConfigured: () => false,
      listFiles: async () => [],
      listChildren: async () => [],
      searchFolders: async () => [],
      getMetadata: async () => null,
      readAnalysisContent: async () => null,
    };

    const sources = new GoogleDriveDocumentSourceReader(drive);

    const result = await new GenerateEstimationPocProposalUseCase(
      ai,
      sources,
    ).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'Prospecto cualquiera',
      clientName: 'Cliente',
      driveFolderUrl:
        'https://drive.google.com/drive/folders/kora-poc-fallback',
      instructions: null,
      answers: [],
    });

    expect(receivedDocumentName).toBe('Requerimiento_KDM.pdf');
    expect(receivedDocumentText).toContain('Facele');
    expect(receivedDocumentText).toContain('SAP');
    expect(result.documentsAnalyzed).toBe(1);
    expect(result.sourceMode).toBe('poc_simulated'); // Gemini real, fuentes KDM de DEMO
    expect(result.totalHours).toBe(160);
  });

  it('entrega los documentos de Drive al proveedor real', async () => {
    let receivedDocumentCount = 0;
    const ai: AiProvider = {
      name: 'gemini',
      generateStructured: async (request) => {
        receivedDocumentCount = request.documents?.length ?? 0;
        return {
          summary: 'Estimación basada en antecedentes',
          roles: [
            {
              role: 'Desarrollador Fullstack',
              unit: 'week',
              duration: 4,
              hoursPerUnit: 40,
              people: 1,
              source: 'Requerimientos.pdf',
            },
          ],
          assumptions: [],
          clarifyingQuestions: [],
        };
      },
    };
    const sources: DocumentSourceReader = {
      readDriveSources: async () => [
        {
          sourceId: 'pdf-1',
          name: 'Requerimientos.pdf',
          mimeType: 'application/pdf',
          path: 'Levantamiento/Requerimientos.pdf',
          dataBase64: 'ZGVtbw==',
        },
      ],
    };

    const result = await new GenerateEstimationPocProposalUseCase(
      ai,
      sources,
    ).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'Proyecto',
      clientName: 'Cliente',
      driveFolderUrl: 'https://drive.google.com/drive/folders/demo',
      instructions: null,
      answers: [],
    });

    expect(receivedDocumentCount).toBe(1);
    expect(result.provider).toBe('gemini');
    expect(result.sourceMode).toBe('drive');
    expect(result.documentsAnalyzed).toBe(1);
    expect(result.totalHours).toBe(160);
  });
  it('genera EDT desde Gemini y reparte las HH exactas entre tareas y módulos', async () => {
    const projectId = '550e8400-e29b-41d4-a716-446655440000';
    let requestedTask = '';
    let documentName = '';
    const ai: AiProvider = {
      name: 'gemini',
      generateStructured: async (request) => {
        requestedTask = request.task;
        documentName = request.documents?.[0]?.name ?? '';
        return { modules: [
          { name: 'Portal', tasks: [
            { wbs: '1.1', name: 'Backend', description: 'API',
              role: 'Desarrollo', weight: 1 },
            { wbs: '1.2', name: 'Frontend', description: 'UI',
              role: 'Desarrollo', weight: 3 },
          ] },
          { name: 'QA', tasks: [
            { wbs: '2.1', name: 'Pruebas', description: 'Regresión',
              role: 'QA', weight: 1 },
          ] },
        ] };
      },
    };
    const sources: DocumentSourceReader = {
      readDriveSources: async () => [{
        sourceId: 'kora-poc-requerimiento-kdm',
        name: 'Requerimiento_KDM.pdf',
        mimeType: 'application/pdf',
        path: 'Demostracion/Requerimiento_KDM.pdf',
        text: 'Portal web y pruebas funcionales.',
      }],
    };
    const proposal = estimationPocProposalSchema.parse({
      projectId, provider: 'gemini', sourceMode: 'poc_simulated',
      documentsAnalyzed: 1, summary: 'KDM',
      roles: [
        { role: 'Desarrollo', unit: 'week', duration: 1,
          hoursPerUnit: 50, people: 1, totalHours: 50 },
        { role: 'QA', unit: 'week', duration: 1,
          hoursPerUnit: 30, people: 1, totalHours: 30 },
      ],
      totalHours: 80, assumptions: [], clarifyingQuestions: [],
    });
    const output = await new GenerateEstimationPocProposalUseCase(
      ai, sources,
    ).generateEdt({
      projectId, projectName: 'Proyecto', clientName: 'Cliente',
      driveFolderUrl: 'https://drive.google.com/drive/folders/kora-poc-fallback',
      instructions: null, answers: [],
    }, proposal);
    expect(requestedTask).toBe('estimation.poc.reference-edt');
    expect(documentName).toBe('Requerimiento_KDM.pdf');
    expect(output.totalHours).toBe(80);
    expect(output.modules.map((module) => module.totalHours)).toEqual([50, 30]);
    expect(output.modules.flatMap((module) => module.tasks.map((task) => task.hours)))
      .toEqual([12.5, 37.5, 30]);
    expect(output.modules[0]?.tasks[0]?.role).toBe('Desarrollo');
  });

  it('rechaza tareas que Gemini asigne a roles inexistentes', async () => {
    const ai: AiProvider = {
      name: 'gemini',
      generateStructured: async () => ({ modules: [{
        name: 'Portal', tasks: [
          { wbs: '1.1', name: 'Inventada', description: '',
            role: 'Rol inexistente', weight: 1 },
        ],
      }] }),
    };
    const reader: DocumentSourceReader = {
      readDriveSources: async () => [{
        sourceId: 'kora-poc-requerimiento-kdm', name: 'Requerimiento_KDM.pdf',
        mimeType: 'application/pdf', path: 'Demo/KDM', text: 'Desarrollo',
      }],
    };
    const projectId = '550e8400-e29b-41d4-a716-446655440000';
    const proposal = estimationPocProposalSchema.parse({
      projectId, provider: 'gemini', sourceMode: 'poc_simulated',
      documentsAnalyzed: 1, summary: 'KDM',
      roles: [{ role: 'Desarrollo', unit: 'week', duration: 1,
        hoursPerUnit: 40, people: 1, totalHours: 40 }],
      totalHours: 40, assumptions: [], clarifyingQuestions: [],
    });
    await expect(new GenerateEstimationPocProposalUseCase(ai, reader)
      .generateEdt({
        projectId, projectName: 'Proyecto', clientName: 'Cliente',
        driveFolderUrl: 'https://drive.google.com/drive/folders/kora-poc-fallback',
        instructions: null, answers: [],
      }, proposal)).rejects.toThrow(/perfiles únicos cotizados/);
  });

});
