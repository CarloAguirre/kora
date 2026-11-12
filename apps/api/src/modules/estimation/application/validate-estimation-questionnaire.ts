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

/**
 * El wizard envía «Otro (especificar)» como "other:<texto>" para conservar
 * exactamente la decisión humana. Solo se admite si la pregunta ofrece
 * explícitamente la opción "other"; el texto debe ser no vacío y <=300.
 */
function validChoiceValue(question: EstimationQuestion, value: string): boolean {
  if (value === 'other') return false; // La UI exige especificar la alternativa.
  if (value.startsWith('other:')) {
    const detail = value.slice('other:'.length).trim();
    return question.options.some((option) => option.value === 'other') &&
      detail.length > 0 && detail.length <= 300;
  }
  return question.options.some((option) => option.value === value);
}

function validQuestionValue(
  question: EstimationQuestion,
  value: SubmitEstimationAnswerInput['value'],
): boolean {
  if (value === null) return !question.required;
  switch (question.answerType) {
    case 'single_choice':
      return typeof value === 'string' && validChoiceValue(question, value);
    case 'multi_choice':
      return Array.isArray(value) && value.length > 0 &&
        new Set(value).size === value.length &&
        value.filter((item) => item.startsWith('other:')).length <= 1 &&
        value.every((item) => validChoiceValue(question, item)) &&
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
