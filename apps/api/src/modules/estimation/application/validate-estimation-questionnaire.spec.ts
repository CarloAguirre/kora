import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { SubmitEstimationAnswerInput } from '@kora/contracts';
import { GetEstimationQuestionnaireDefinitionUseCase } from './use-cases/get-estimation-questionnaire-definition.use-case';
import { validateFixedQuestionnaireAnswers, validateQuestionnaireAnswers } from './validate-estimation-questionnaire';

const definition = new GetEstimationQuestionnaireDefinitionUseCase().execute();
const complete = (): SubmitEstimationAnswerInput[] => [
  { questionId: 'F01', value: 'mvp', usedAssumption: false },
  { questionId: 'F02', value: '8 semanas', usedAssumption: false },
  { questionId: 'F03', value: 'ideal', usedAssumption: false },
  { questionId: 'F04', value: ['uat'], usedAssumption: false },
];
const validate = (answers: SubmitEstimationAnswerInput[]) =>
  validateFixedQuestionnaireAnswers(definition, answers);

describe('R4-a · respuestas de cuestionario F01–F05', () => {
  it('admite todas las fijas obligatorias y F05 opcional, sin exigir preguntas dinámicas', () => {
    expect(() => validate(complete())).not.toThrow();
    expect(() => validate([...complete(), {
      questionId: 'F05', value: 'Sin integraciones externas', usedAssumption: false,
    }])).not.toThrow();
  });

  it('bloquea respuestas vacías y las obligatorias ausentes', () => {
    expect(() => validate([])).toThrow(BadRequestException);
    expect(() => validate(complete().filter((answer) => answer.questionId !== 'F02')))
      .toThrow(/F02/);
    expect(() => validate(complete().map((answer) => answer.questionId === 'F02'
      ? { ...answer, value: '  ' } : answer))).toThrow(/F02/);
  });

  it('no acepta IDs desconocidos o preguntas dinámicas sin evidencia', () => {
    expect(() => validate([...complete(), {
      questionId: 'D01', value: 'Algo', usedAssumption: false,
    }])).toThrow(/Pregunta desconocida/);
  });

  it('rechaza duplicados, valores de opción inválidos o tipos incorrectos', () => {
    expect(() => validate([...complete(), complete()[0]!])).toThrow(/duplicada/);
    expect(() => validate(complete().map((answer) => answer.questionId === 'F01'
      ? { ...answer, value: 'otra-escala' } : answer))).toThrow(/F01/);
    expect(() => validate(complete().map((answer) => answer.questionId === 'F03'
      ? { ...answer, value: 10 } : answer))).toThrow(/F03/);
  });

  it('hace "ninguna" excluyente en postproducción', () => {
    expect(() => validate(complete().map((answer) => answer.questionId === 'F04'
      ? { ...answer, value: ['none'] } : answer))).not.toThrow();
    expect(() => validate(complete().map((answer) => answer.questionId === 'F04'
      ? { ...answer, value: ['none', 'uat'] } : answer))).toThrow(/F04/);
  });

  it('no permite usar supuesto sin una política explícita', () => {
    expect(() => validate(complete().map((answer) => answer.questionId === 'F02'
      ? { ...answer, value: null, usedAssumption: true } : answer))).toThrow(/F02/);
    expect(() => validate([...complete(), {
      questionId: 'F05', value: null, usedAssumption: true,
    }])).not.toThrow();
  });
  it('R4-b: valida las dinámicas ligadas a KDM, sin permitir omitirlas', () => {
    const dynamic = {
      id: 'D01', kind: 'dynamic' as const,
      category: 'Integraciones', question: '¿Existe API SAP?', reason: 'Impacta HH',
      impact: 'high' as const, answerType: 'single_choice' as const,
      required: true, options: [
        { value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' },
      ],
      canPrefill: false, confidence: 'medium' as const, priorityScore: 5,
      sourceRefs: [{
        sourceId: 'kora-poc-requerimiento-kdm', fileName: 'Requerimiento_KDM.pdf',
      }], dependsOn: [],
    };
    expect(() => validateQuestionnaireAnswers(definition, [
      ...complete(), { questionId: 'D01', value: 'yes', usedAssumption: false },
    ], [dynamic])).not.toThrow();
    expect(() => validateQuestionnaireAnswers(definition, complete(), [dynamic]))
      .toThrow(/D01/);
    expect(() => validateQuestionnaireAnswers(definition, [
      ...complete(), { questionId: 'D01', value: 'unknown', usedAssumption: false },
    ], [dynamic])).toThrow(/D01/);
  });

});
