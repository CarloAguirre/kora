import { describe, expect, it } from 'vitest';
import {
  estimationQuestionnaireDefinitionSchema,
  projectEstimationContextSchema,
} from './estimation.contract';

describe('estimation contracts', () => {
  it('acepta un contexto normalizado mínimo y trazable', () => {
    const parsed = projectEstimationContextSchema.parse({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      summary: 'Portal para digitalizar el proceso de recepción.',
      requirements: [
        {
          id: 'RF-001',
          type: 'functional',
          module: 'Recepción',
          title: 'Registrar recepción',
          description: 'El usuario debe poder registrar una recepción.',
          scope: 'in_scope',
          confidence: 'high',
          sourceRefs: [
            {
              sourceId: 'drive-1',
              fileName: 'requerimientos.pdf',
              page: 3,
            },
          ],
        },
      ],
      userStories: [],
      technicalContext: {
        solutionMode: 'greenfield',
        environments: [],
        integrations: [],
        constraints: [],
      },
      gaps: [],
      assumptions: [],
      generatedAt: '2026-10-21T15:00:00-03:00',
    });

    expect(parsed.requirements[0]?.id).toBe('RF-001');
    expect(parsed.requirements[0]?.sourceRefs[0]?.fileName).toBe('requerimientos.pdf');
  });

  it('valida los límites del cuestionario adaptativo', () => {
    expect(() =>
      estimationQuestionnaireDefinitionSchema.parse({
        fixedQuestions: [],
        maxDynamicFirstRound: 11,
        maxDynamicFollowUp: 2,
        targetMinutesMin: 3,
        targetMinutesMax: 5,
      }),
    ).toThrow();
  });
});
