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
  it('genera EDT v2 por actividad/perfil, conserva tramos y NO prorratea un total previo', async () => {
    const projectId = '550e8400-e29b-41d4-a716-446655440000';
    let requestedTask = '';
    let requestedSchema: Readonly<Record<string, unknown>> | undefined;
    const row = (partial: Partial<{
      wbs: string; stageCode: string; stageName: string; startWeek: number;
      durationWeeks: number; module: string; submodule: string; name: string;
      description: string; role: string; hours: number; references: string;
      classification: string;
    }>) => ({
      wbs: 'T01.01', stageCode: 'T01', stageName: 'Análisis',
      startWeek: 1, durationWeeks: 2, module: 'Portal', submodule: 'API',
      name: 'Construir API', description: 'Servicio de integración.',
      role: 'Desarrollo', hours: 12, references: 'R01;R03',
      classification: 'C', ...partial,
    });
    const ai: AiProvider = {
      name: 'gemini',
      generateStructured: async (request) => {
        requestedTask = request.task;
        requestedSchema = request.responseJsonSchema;
        return {
          reservePercent: 10,
          activities: [
            row({ role: 'Desarrollo', hours: 12 }),
            row({ role: 'QA', hours: 3 }),
            row({ wbs: 'T01.02', name: 'Frontend', submodule: 'Web',
              role: 'Desarrollo', hours: 40, references: 'R04' }),
            row({ wbs: 'T02.01', stageCode: 'T02', stageName: 'Pruebas',
              startWeek: 3, durationWeeks: 1, module: 'QA', submodule: 'Regresión',
              name: 'Verificar flujo', role: 'QA', hours: 24, references: 'R05' }),
          ],
        };
      },
    };
    const sources: DocumentSourceReader = {
      readDriveSources: async () => [{
        sourceId: 'kora-poc-requerimiento-kdm',
        name: 'Requerimiento_KDM.pdf', mimeType: 'application/pdf',
        path: 'Demostracion/Requerimiento_KDM.pdf', text: 'API y frontend.',
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
    const generator = new GenerateEstimationPocProposalUseCase(ai, sources);
    const output = await generator.generateEdt({
      projectId, projectName: 'Proyecto', clientName: 'Cliente',
      driveFolderUrl: 'https://drive.google.com/drive/folders/kora-poc-fallback',
      instructions: null, answers: [],
    }, proposal);
    expect(requestedTask).toBe('estimation.poc.reference-edt');
    expect(JSON.stringify(requestedSchema)).not.toMatch(/"minItems"|"maxItems"|"minimum"|"maximum"/);
    expect(output.schemaVersion).toBe('kora.quotation.reference-edt.v2');
    expect(output.totalHours).toBe(79); // 52 Desarrollo + 27 QA; NO los 80 HH preliminares.
    expect(output.modules.map((module) => module.totalHours)).toEqual([55, 24]);
    expect(output.modules[0]?.tasks[0]?.hours).toBe(15);
    expect(output.modules[0]?.tasks[0]?.roleEffort).toEqual([
      { role: 'Desarrollo', hours: 12 }, { role: 'QA', hours: 3 },
    ]);
    expect(output.modules[0]?.tasks[0]?.referenceIds).toEqual(['R01', 'R03']);
    expect(output.stages?.map((stage) => stage.totalHours)).toEqual([55, 24]);
    expect(output.reservePercent).toBe(10);
    expect(output.reserveHours).toBe(7.9);
    expect(output.totalWithReserve).toBe(86.9);
    const reconciled = generator.reconcileProposalWithEdt(proposal, output);
    expect(reconciled.totalHours).toBe(79);
    expect(reconciled.roles.map((role) => role.totalHours)).toEqual([52, 27]);
    expect(proposal.totalHours).toBe(80); // La propuesta preliminar no se altera.
  });

  it('solicita una corrección a Gemini cuando la primera EDT tiene HH no redondeadas', async () => {
    const projectId = '550e8400-e29b-41d4-a716-446655440000';
    const proposal = estimationPocProposalSchema.parse({
      projectId, provider: 'gemini', sourceMode: 'poc_simulated',
      documentsAnalyzed: 1, summary: 'Prueba de corrección',
      roles: [{ role: 'Desarrollo', unit: 'week', duration: 1,
        hoursPerUnit: 40, people: 1, totalHours: 40 }],
      totalHours: 40, assumptions: [], clarifyingQuestions: [],
    });
    let calls = 0;
    let retryInstructions = '';
    const ai: AiProvider = {
      name: 'gemini',
      generateStructured: async (request) => {
        calls++;
        if (calls === 2) retryInstructions = request.instructions ?? '';
        return {
          reservePercent: 0,
          activities: [{
            wbs: 'T01.01', stageCode: 'T01', stageName: 'Implementación',
            startWeek: 1, durationWeeks: 2, module: 'Portal', submodule: 'Backend',
            name: 'Servicio', description: 'Crear endpoint',
            role: 'Desarrollo', hours: calls === 1 ? 14.123 : 14.12,
            references: 'R01', classification: 'Desarrollo',
          }],
        };
      },
    };
    const sources: DocumentSourceReader = {
      readDriveSources: async () => [{
        sourceId: 'kora-poc-requerimiento-kdm', name: 'Requerimiento_KDM.pdf',
        mimeType: 'application/pdf', path: 'KDM.pdf', text: 'Servicio backend.',
      }],
    };
    const result = await new GenerateEstimationPocProposalUseCase(ai, sources).generateEdt({
      projectId, projectName: 'KDM', clientName: 'Cliente',
      driveFolderUrl: 'https://drive.google.com/drive/folders/kora-poc-fallback',
      instructions: null, answers: [],
    }, proposal);
    expect(calls).toBe(2);
    expect(retryInstructions).toMatch(/rechazada por las validaciones/);
    expect(retryInstructions).toMatch(/dos decimales/);
    expect(result.totalHours).toBe(14.12);
    expect(result.modules[0]?.tasks[0]?.roleEffort).toEqual([
      { role: 'Desarrollo', hours: 14.12 },
    ]);
  });

  it('rechaza actividades con roles ajenos a la propuesta y no genera HH inventadas', async () => {
    const ai: AiProvider = {
      name: 'gemini',
      generateStructured: async () => ({
        reservePercent: 0,
        activities: [{
          wbs: 'T01.01', stageCode: 'T01', stageName: 'Levantamiento',
          startWeek: 1, durationWeeks: 1, module: 'Portal', submodule: 'Web',
          name: 'Actividad inventada', description: 'Fuera de roles.',
          role: 'Rol inexistente', hours: 8, references: '',
          classification: '',
        }],
      }),
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
      }, proposal)).rejects.toThrow(/perfiles ajenos/);
  });

});
