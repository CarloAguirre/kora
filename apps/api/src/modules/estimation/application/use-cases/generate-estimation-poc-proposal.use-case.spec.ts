import { describe, expect, it } from 'vitest';
import type { AiProvider } from '../../../ai/application/ports/ai-provider.port';
import type { DocumentSourceReader } from '../ports/document-source-reader.port';
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
});
