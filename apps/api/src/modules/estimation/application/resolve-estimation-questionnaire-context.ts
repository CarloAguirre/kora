import type {
  EstimationQuestion,
  GenerateEstimationPocInput,
} from '@kora/contracts';
import { ESTIMATION_QUESTIONNAIRE_DEFINITION } from './use-cases/get-estimation-questionnaire-definition.use-case';

/**
 * La selección D01=yes/null carece de significado sin el cuestionario.
 * Este contexto preserva el significado comercial confirmado por el usuario
 * para las dos llamadas finales a Gemini: propuesta de roles y EDT.
 *
 * No se copian extractos completos de fuentes: el documento ya se adjunta
 * a la solicitud, y duplicarlo aquí consumiría tokens adicionales.
 */
export type EstimationInputWithQuestions = GenerateEstimationPocInput & {
  readonly dynamicQuestions?: readonly EstimationQuestion[];
  readonly confirmedUnderstanding?: string;
};

export interface ResolvedEstimationAnswer {
  questionId: string;
  question: string;
  answer: string;
  usedAssumption: boolean;
  /** Identificadores de documentos citados para trazabilidad, no su contenido. */
  sourceIds: string[];
}

export function resolveEstimationQuestionnaireContext(
  input: EstimationInputWithQuestions,
): ResolvedEstimationAnswer[] {
  const fixed = ESTIMATION_QUESTIONNAIRE_DEFINITION.fixedQuestions;
  const questions = new Map<string, EstimationQuestion>(
    [...fixed, ...(input.dynamicQuestions ?? [])].map((question) =>
      [question.id, question]),
  );
  return input.answers.map((item) => {
    const question = questions.get(item.questionId);
    if (!question) {
      throw new Error(
        'La respuesta ' + item.questionId +
        ' no tiene pregunta asociada. No debe generarse una EDT sin su contexto.',
      );
    }
    const answer = item.usedAssumption
      ? (question.assumptionIfSkipped
        ? 'SUPUESTO NO CONFIRMADO: ' + question.assumptionIfSkipped
        : 'SUPUESTO SOLICITADO SIN CONTENIDO: requiere revisión humana')
      : readableAnswer(question, item.value);
    return {
      questionId: question.id,
      question: question.question,
      answer,
      usedAssumption: item.usedAssumption,
      sourceIds: [...new Set(question.sourceRefs.map((ref) => ref.sourceId))],
    };
  });
}

function readableAnswer(
  question: EstimationQuestion, value: unknown,
): string {
  if (value === null || value === undefined) return 'No informado';
  const optionLabel = (item: string) =>
    question.options.find((opt) => opt.value === item)?.label ?? item;
  if (Array.isArray(value)) {
    return value.map((entry) => optionLabel(String(entry))).join('; ');
  }
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'string') return optionLabel(value);
  if (typeof value === 'number') return String(value);
  return 'Formato de respuesta no reconocido';
}
