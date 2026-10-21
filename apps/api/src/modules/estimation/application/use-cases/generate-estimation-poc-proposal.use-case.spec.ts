import { describe, expect, it } from 'vitest';
import type { AiProvider } from '../../../ai/application/ports/ai-provider.port';
import { GenerateEstimationPocProposalUseCase } from './generate-estimation-poc-proposal.use-case';

describe('GenerateEstimationPocProposalUseCase', () => {
  it('calcula las HH fuera del proveedor IA', async () => {
    const ai: AiProvider = {
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

    const result = await new GenerateEstimationPocProposalUseCase(ai).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'Proyecto',
      clientName: 'Cliente',
      driveFolderUrl: 'https://drive.google.com/drive/folders/demo',
      instructions: null,
    });

    expect(result.roles[0]?.totalHours).toBe(160);
    expect(result.roles[1]?.totalHours).toBe(24);
    expect(result.totalHours).toBe(184);
    expect(result.sourceMode).toBe('poc_simulated');
    expect(result.documentsAnalyzed).toBe(0);
  });
});
