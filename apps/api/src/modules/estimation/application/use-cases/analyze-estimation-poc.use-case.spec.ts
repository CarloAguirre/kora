import { describe, expect, it } from 'vitest';
import type { AiProvider } from '../../../ai/application/ports/ai-provider.port';
import { AnalyzeEstimationPocUseCase } from './analyze-estimation-poc.use-case';

describe('AnalyzeEstimationPocUseCase', () => {
  it('normaliza el análisis previo sin generar todavía HH', async () => {
    const ai: AiProvider = {
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
});
