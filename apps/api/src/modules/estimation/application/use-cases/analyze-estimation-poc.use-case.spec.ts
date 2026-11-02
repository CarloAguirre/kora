import { describe, expect, it } from 'vitest';
import type { AiProvider } from '../../../ai/application/ports/ai-provider.port';
import type { DocumentSourceReader } from '../ports/document-source-reader.port';
import { AnalyzeEstimationPocUseCase } from './analyze-estimation-poc.use-case';

describe('AnalyzeEstimationPocUseCase', () => {
  it('normaliza el análisis previo sin generar todavía HH', async () => {
    const ai: AiProvider = {
      name: 'poc-ai',
      generateStructured: async () => ({
        summary: 'Análisis preliminar',
        detectedDocuments: [],
        dynamicQuestions: [
          {
            id: 'D01',
            kind: 'dynamic',
            category: 'Integraciones',
            question: '¿Existe API?',
            reason: 'Cambia el esfuerzo de integración.',
            impact: 'high',
            answerType: 'single_choice',
            options: [
              { value: 'yes', label: 'Sí' },
              { value: 'no', label: 'No' },
            ],
            required: true,
            canPrefill: false,
            confidence: 'low',
            priorityScore: 3,
            sourceRefs: [],
            dependsOn: [],
          },
        ],
      }),
    };

    const result = await new AnalyzeEstimationPocUseCase(ai).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'Proyecto',
      clientName: 'Cliente',
      driveFolderUrl: 'https://drive.google.com/drive/folders/demo',
      instructions: null,
    });

    expect(result.documentsAnalyzed).toBe(0);
    expect(result.dynamicQuestions).toHaveLength(1);
    expect(result.dynamicQuestions[0]?.kind).toBe('dynamic');
    expect(result).not.toHaveProperty('roles');
    expect(result).not.toHaveProperty('totalHours');
  });
  it('pide preguntas dinámicas a Gemini usando el documento KDM real de la fuente de demo', async () => {
    const sourceId = 'kora-poc-requerimiento-kdm';
    const seen: { documents?: unknown; task?: string } = {};
    const ai: AiProvider = {
      name: 'gemini',
      generateStructured: async (request) => {
        seen.documents = request.documents;
        seen.task = request.task;
        return {
          summary: 'KDM requiere confirmar disponibilidad de APIs.',
          fixedPrefills: [
            { questionId: 'F01', value: 'mvp', sourceId, reason: 'Primera versión documentada' },
            { questionId: 'F04', value: 'none,uat', sourceId, reason: 'Contradicción' },
            { questionId: 'F02', value: '8 semanas', sourceId: 'otro-doc', reason: 'Fuente no incluida' },
          ],
          dynamicQuestions: [{
            id: 'ejemplo', kind: 'dynamic',
            category: 'Integraciones', question: '¿Existe API SAP documentada?',
            reason: 'La implementación cambia las HH.',
            impact: 'high', answerType: 'single_choice',
            options: [
              { value: 'yes', label: 'Sí' },
              { value: 'no', label: 'No' },
            ],
            required: true, confidence: 'medium', priorityScore: 5,
            sourceRefs: [{ sourceId, fileName: 'Requerimiento_KDM.pdf' }],
          }],
        };
      },
    };
    const sources: DocumentSourceReader = {
      readDriveSources: async () => [{
        sourceId, name: 'Requerimiento_KDM.pdf',
        mimeType: 'application/pdf', path: 'Levantamiento/Requerimiento_KDM.pdf',
        text: 'El sistema integra SAP, verificar APIs disponibles.',
      }],
    };
    const result = await new AnalyzeEstimationPocUseCase(ai, sources).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'Proyecto', clientName: 'Cliente',
      driveFolderUrl: 'https://drive.google.com/drive/folders/kora-poc-fallback',
      instructions: null,
    });
    expect(seen.task).toBe('estimation.poc.analysis');
    expect(seen.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Requerimiento_KDM.pdf' }),
    ]));
    expect(result.provider).toBe('gemini');
    expect(result.sourceMode).toBe('poc_simulated');
    expect(result.documentsAnalyzed).toBe(1);
    expect(result.detectedDocuments).toEqual(['Requerimiento_KDM.pdf']);
    expect(result.fixedPrefills).toEqual([{
      questionId: 'F01', value: 'mvp',
      sourceRefs: [{ sourceId, fileName: 'Requerimiento_KDM.pdf' }],
    }]);
    expect(result.dynamicQuestions[0]).toMatchObject({
      id: 'D01',
      sourceRefs: [{ sourceId, fileName: 'Requerimiento_KDM.pdf' }],
    });
  });

  it('rechaza aclaraciones que citan archivos inexistentes o ajenos al KDM', async () => {
    const ai: AiProvider = {
      name: 'gemini',
      generateStructured: async () => ({
        summary: 'Análisis',
        dynamicQuestions: [{
          id: 'D01', kind: 'dynamic', category: 'SAP',
          question: '¿API?', reason: 'Impacta integración',
          impact: 'high', answerType: 'text', options: [], required: true,
          sourceRefs: [{ sourceId: 'otro-documento', fileName: 'otro.pdf' }],
        }],
      }),
    };
    const reader: DocumentSourceReader = {
      readDriveSources: async () => [{
        sourceId: 'kora-poc-requerimiento-kdm', name: 'Requerimiento_KDM.pdf',
        mimeType: 'application/pdf', path: 'Demo/KDM', text: 'SAP',
      }],
    };
    await expect(new AnalyzeEstimationPocUseCase(ai, reader).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'Proyecto', clientName: 'Cliente',
      driveFolderUrl: 'https://drive.google.com/drive/folders/kora-poc-fallback',
      instructions: null,
    })).rejects.toThrow(/documento proporcionado/);
  });

});
