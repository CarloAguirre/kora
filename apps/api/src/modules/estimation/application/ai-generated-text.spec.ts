import { describe, expect, it } from 'vitest';
import { estimationPocAiDraftSchema } from '@kora/contracts';
import { fitGeneratedLabel, normalizeGeneratedProposal } from './ai-generated-text';

describe('normalización de prosa del proveedor IA', () => {
  it('acota etiquetas del modelo pero no cambia IDs, roles, dotación ni HH', () => {
    const source = {
      summary: 'Resumen del alcance; '.repeat(250),
      roles: [{
        role: 'Desarrollo', unit: 'week', duration: 4, people: 2,
        hoursPerUnit: 40, source: 'Fundamentación técnica. '.repeat(130),
      }],
      assumptions: ['Supuesto detallado. '.repeat(130)],
      clarifyingQuestions: ['Confirmación de alcance. '.repeat(130)],
    };
    const fixed = estimationPocAiDraftSchema.parse(normalizeGeneratedProposal(source));
    expect(fixed.summary.length).toBeLessThanOrEqual(3000);
    expect(fixed.roles[0]).toMatchObject({
      role: 'Desarrollo', unit: 'week', duration: 4, people: 2, hoursPerUnit: 40,
    });
    expect(fixed.roles[0]?.source?.length).toBeLessThanOrEqual(1500);
    expect(fixed.assumptions[0]?.length).toBeLessThanOrEqual(1500);
    expect(fixed.clarifyingQuestions[0]?.length).toBeLessThanOrEqual(1500);
    expect(source.roles[0]?.source.length).toBeGreaterThan(1500);
    expect(source.summary.length).toBeGreaterThan(3000);
  });

  it('deja intactos los valores que caben y no inventa texto para tipos inválidos', () => {
    expect(fitGeneratedLabel('  Normal  ', 30)).toBe('Normal');
    expect(fitGeneratedLabel('Z'.repeat(301), 300).length).toBe(300);
    expect(normalizeGeneratedProposal({
      summary: 123, assumptions: null, roles: [{}],
      clarifyingQuestions: 'error',
    })).toEqual({
      summary: 123, assumptions: null, roles: [{}],
      clarifyingQuestions: 'error',
    });
  });
});
