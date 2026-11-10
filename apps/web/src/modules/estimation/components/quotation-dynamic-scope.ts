import type { EstimationQuestion } from '@kora/contracts';

/**
 * El análisis documental ocurre antes de que el usuario responda F01.
 * Si el modelo llama "PoC" al entregable actual, adaptar solo esas menciones
 * genéricas tras la selección de F01, no las referencias a PoC preexistentes.
 * Los nombres de archivos, extractos de fuentes y valores de las opciones
 * permanecen intactos; la pregunta enviada al backend coincide con la vista.
 */
const DELIVERY_LABELS: Record<string, Record<string, string>> = {
  mvp: {
    el: 'el MVP', del: 'del MVP', al: 'al MVP',
    un: 'un MVP', una: 'un MVP', este: 'este MVP', esta: 'este MVP',
  },
  complete: {
    el: 'la solución completa', del: 'de la solución completa',
    al: 'a la solución completa', un: 'una solución completa',
    una: 'una solución completa', este: 'esta solución completa',
    esta: 'esta solución completa',
  },
  phase: {
    el: 'la fase seleccionada', del: 'de la fase seleccionada',
    al: 'a la fase seleccionada', un: 'una fase seleccionada',
    una: 'una fase seleccionada', este: 'esta fase seleccionada',
    esta: 'esta fase seleccionada',
  },
  evolution: {
    el: 'el desarrollo evolutivo', del: 'del desarrollo evolutivo',
    al: 'al desarrollo evolutivo', un: 'un desarrollo evolutivo',
    una: 'un desarrollo evolutivo', este: 'este desarrollo evolutivo',
    esta: 'este desarrollo evolutivo',
  },
};

const HISTORICAL_QUALIFIER = /^\s+(?:anterior|previo|previa|existente|preexistente|históric[oa]|original|heredad[oa]|implementad[oa]|ya (?:cread[oa]|implementad[oa]))\b/i;

export function adaptDynamicQuestionToScope(
  question: EstimationQuestion,
  selectedLevel: unknown,
): EstimationQuestion {
  if (question.kind !== 'dynamic' || typeof selectedLevel !== 'string') return question;
  const forms = DELIVERY_LABELS[selectedLevel];
  if (!forms) return question; // PoC o F01 aún no confirmado
  const adapt = (value: string): string => value.replace(
    /\b(del|al|el|un|una|este|esta)\s+PoC\b/gi,
    (matched, article: string, offset: number, source: string) => {
      if (HISTORICAL_QUALIFIER.test(source.slice(offset + matched.length))) return matched;
      return forms[article.toLowerCase()] ?? matched;
    },
  );
  return {
    ...question,
    question: adapt(question.question),
    ...(question.reason ? { reason: adapt(question.reason) } : {}),
    ...(question.assumptionIfSkipped
      ? { assumptionIfSkipped: adapt(question.assumptionIfSkipped) } : {}),
    options: question.options.map((option) => ({
      ...option, label: adapt(option.label),
    })),
    // Nunca alterar sourceRefs, sourceId, excerpt, value, IDs ni decisiones.
  };
}
