import { describe, expect, it } from 'vitest';
import type { EstimationQuestion } from '@kora/contracts';
import {
  resolveEstimationQuestionnaireContext,
  type EstimationInputWithQuestions,
} from './resolve-estimation-questionnaire-context';

const documentSource = [{
  sourceId: 'kora-poc-requerimiento-kdm',
  fileName: 'Requerimiento_KDM.pdf',
}];

const dynamic: EstimationQuestion[] = [
  {
    id: 'D01', kind: 'dynamic', category: 'Integración',
    question: '¿Cómo implementar el mantenedor de equivalencias CECO?',
    reason: 'Dos alternativas de alcance diferente.',
    impact: 'high', answerType: 'single_choice',
    options: [
      { value: 'local_backoffice', label: 'Mantenedor Local con carga manual' },
      { value: 'sap_api_sync', label: 'Sincronización automática mediante API SAP' },
    ],
    required: true, canPrefill: false, confidence: 'high',
    assumptionIfSkipped: 'Desarrollar mantenedor local sin sincronización SAP.',
    priorityScore: 90, sourceRefs: documentSource, dependsOn: [],
  },
  {
    id: 'D02', kind: 'dynamic', category: 'Seguridad',
    question: '¿Se incluirá SSO con Microsoft Entra ID?',
    reason: 'Alternativa opcional.',
    impact: 'medium', answerType: 'single_choice',
    options: [
      { value: 'yes', label: 'Sí, incluir SSO con Entra ID' },
      { value: 'no', label: 'No, solo credenciales locales' },
    ],
    required: true, canPrefill: false, confidence: 'high',
    assumptionIfSkipped: 'No incluir SSO.',
    priorityScore: 80, sourceRefs: documentSource, dependsOn: [],
  },
];

const sample: EstimationInputWithQuestions = {
  projectId: '550e8400-e29b-41d4-a716-446655440000',
  projectName: 'Migración de programas',
  clientName: 'Academico IFPO',
  driveFolderUrl: 'https://drive.google.com/drive/folders/kora-poc-fallback',
  instructions: null,
  dynamicQuestions: dynamic,
  answers: [
    { questionId: 'F01', value: 'phase', usedAssumption: false },
    { questionId: 'F02', value: 'Sin restricción', usedAssumption: false },
    { questionId: 'F03', value: 'ideal', usedAssumption: false },
    { questionId: 'F04', value: ['pilot', 'uat'], usedAssumption: false },
    { questionId: 'D01', value: null, usedAssumption: true },
    { questionId: 'D02', value: 'yes', usedAssumption: false },
  ],
};

describe('Cuestionario confirmado para Gemini sin llamadas de red', () => {
  it('resuelve códigos fijos y dinámicos en opciones textuales sin inferir decisiones', () => {
    const answers = resolveEstimationQuestionnaireContext(sample);
    expect(answers).toHaveLength(6);
    expect(answers.find((a) => a.questionId === 'F01')?.answer).toBe('Fase específica');
    expect(answers.find((a) => a.questionId === 'F03')?.answer).toBe('Equipo ideal');
    expect(answers.find((a) => a.questionId === 'F04')?.answer).toBe('Marcha blanca; UAT');
    expect(answers.find((a) => a.questionId === 'D02')?.answer)
      .toBe('Sí, incluir SSO con Entra ID');
    expect(answers.find((a) => a.questionId === 'D02')?.question)
      .toContain('Microsoft Entra ID');
  });

  it('no confunde un supuesto pendiente de CECO con aprobación del usuario', () => {
    const answers = resolveEstimationQuestionnaireContext(sample);
    const ceCo = answers.find((a) => a.questionId === 'D01');
    expect(ceCo?.usedAssumption).toBe(true);
    expect(ceCo?.answer).toBe(
      'SUPUESTO NO CONFIRMADO: Desarrollar mantenedor local sin sincronización SAP.',
    );
    expect(ceCo?.sourceIds).toEqual(['kora-poc-requerimiento-kdm']);
  });

  it('rechaza respuestas con preguntas inexistentes antes de invocar Gemini', () => {
    expect(() => resolveEstimationQuestionnaireContext({
      ...sample,
      dynamicQuestions: [],
    })).toThrow(/no tiene pregunta asociada/);
  });

  it('funciona con la llamada antigua sin cuestionario ni respuestas', () => {
    expect(resolveEstimationQuestionnaireContext({ ...sample, answers: [], dynamicQuestions: [] }))
      .toEqual([]);
  });
});
