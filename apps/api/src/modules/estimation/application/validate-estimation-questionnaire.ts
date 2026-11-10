import { BadRequestException } from '@nestjs/common';
import type {
  EstimationQuestion,
  EstimationQuestionnaireDefinition,
  SubmitEstimationAnswerInput,
} from '@kora/contracts';

/** R4-a: el nuevo endpoint revisado admite únicamente F01–F05 del catálogo
 * publicado; las aclaraciones dinámicas requieren otro paso con evidencia real.
 */
export function validateFixedQuestionnaireAnswers(
  definition: EstimationQuestionnaireDefinition,
  answers: readonly SubmitEstimationAnswerInput[],
): void {
  validateQuestionnaireAnswers(definition, answers, []);
}

/** R4-b: valida en el servidor el cuestionario F01–F05 junto con las
 * preguntas dinámicas provenientes del análisis KDM. El borrador permanece
 * pendiente y no puede enviarse comercialmente. */
export function validateQuestionnaireAnswers(
  definition: EstimationQuestionnaireDefinition,
  answers: readonly SubmitEstimationAnswerInput[],
  dynamicQuestions: readonly EstimationQuestion[],
): void {
  if (dynamicQuestions.length > definition.maxDynamicFirstRound) {
    throw new BadRequestException('Se superó el máximo de preguntas dinámicas.');
  }
  const questions = new Map(definition.fixedQuestions.map((question) => [question.id, question]));
  for (const question of dynamicQuestions) {
    if (question.kind !== 'dynamic' || !/^D0[1-5]$/.test(question.id) ||
        questions.has(question.id) || !question.reason?.trim() ||
        question.sourceRefs.length === 0) {
      throw new BadRequestException('Pregunta dinámica inválida o sin origen documental.');
    }
    questions.set(question.id, question);
  }
  const seen = new Set<string>();
  for (const answer of answers) {
    const question = questions.get(answer.questionId);
    if (!question) throw new BadRequestException(
      'Pregunta desconocida o dinámica sin análisis documental: ' + answer.questionId,
    );
    if (seen.has(answer.questionId)) throw new BadRequestException(
      'La respuesta a ' + answer.questionId + ' está duplicada.',
    );
    seen.add(answer.questionId);
    if (answer.usedAssumption) {
      if (!question.assumptionIfSkipped || answer.value !== null) {
        throw new BadRequestException('Supuesto no permitido para ' + question.id + '.');
      }
      continue;
    }
    if (!validQuestionValue(question, answer.value)) {
      throw new BadRequestException('Respuesta inválida para ' + question.id + '.');
    }
  }
  for (const question of questions.values()) {
    if (question.required && !seen.has(question.id)) {
      throw new BadRequestException('Falta responder la pregunta obligatoria ' + question.id + '.');
    }
  }
}

function validQuestionValue(
  question: EstimationQuestion,
  value: SubmitEstimationAnswerInput['value'],
): boolean {
  if (value === null) return !question.required;
  switch (question.answerType) {
    case 'single_choice':
      return typeof value === 'string' &&
        question.options.some((option) => option.value === value);
    case 'multi_choice':
      return Array.isArray(value) && value.length > 0 &&
        new Set(value).size === value.length &&
        value.every((item) => question.options.some((option) => option.value === item)) &&
        !(value.includes('none') && value.length > 1);
    case 'text':
      return typeof value === 'string' && value.trim().length > 0 && value.length <= 2000;
    case 'date':
      return typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value));
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'confirmation':
      return typeof value === 'boolean';
    default:
      return false;
  }
}
