import { describe, expect, it } from 'vitest';
import type { EstimationQuestion } from '@kora/contracts';
import { adaptDynamicQuestionToScope } from './quotation-dynamic-scope';

const question = {
  id: 'D03', kind: 'dynamic', category: 'Automatización',
  question: '¿Cómo debe relacionarse el PoC con los robots RPA existentes?',
  reason: 'Excluir los robots del PoC si están fuera del alcance.',
  assumptionIfSkipped: 'Mantener el PoC sin cambios en robots.',
  answerType: 'single_choice', required: false, impact: 'high',
  options: [
    { value: 'reuse_poc', label: 'Reutilizar robots del PoC' },
    { value: 'leave', label: 'Excluir robots del PoC' },
  ],
  sourceRefs: [{
    sourceId: 'documento-1', fileName: 'Contrato PoC original.pdf',
    excerpt: 'El PoC previo se utilizó para pilotos RPA.',
  }],
} as EstimationQuestion;

describe('Aclaraciones de IA según nivel F01', () => {
  it('convierte referencias genéricas al entregable en MVP, sin tocar fuentes ni valores', () => {
    const updated = adaptDynamicQuestionToScope(question, 'mvp');
    expect(updated.question).toContain('el MVP');
    expect(updated.reason).toContain('del MVP');
    expect(updated.options[0]?.label).toContain('del MVP');
    expect(updated.options[1]?.label).toBe('Excluir robots del MVP');
    expect(updated.assumptionIfSkipped).toContain('el MVP');
    expect(updated.options[0]?.value).toBe('reuse_poc');
    expect(updated.sourceRefs).toEqual(question.sourceRefs);
    expect(question.question).toContain('el PoC');
  });

  it('emplea solución completa con concordancia y conserva una PoC preexistente', () => {
    const withHistory = {
      ...question,
      question: '¿Qué parte del PoC anterior debe reutilizar la solución? ¿Cómo operará el PoC actual?',
    };
    const updated = adaptDynamicQuestionToScope(withHistory, 'complete');
    expect(updated.question).toContain('del PoC anterior');
    expect(updated.question).toContain('la solución completa actual');
    expect(updated.options[1]?.label).toBe('Excluir robots de la solución completa');
  });

  it('admite fases y evolutivos y no altera la selección PoC original', () => {
    expect(adaptDynamicQuestionToScope(question, 'phase').question)
      .toContain('la fase seleccionada');
    expect(adaptDynamicQuestionToScope(question, 'evolution').question)
      .toContain('el desarrollo evolutivo');
    expect(adaptDynamicQuestionToScope(question, 'poc')).toBe(question);
    expect(adaptDynamicQuestionToScope(question, null)).toBe(question);
  });
});
