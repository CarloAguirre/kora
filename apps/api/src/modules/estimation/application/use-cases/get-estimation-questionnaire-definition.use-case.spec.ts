import { describe, expect, it } from 'vitest';
import { GetEstimationQuestionnaireDefinitionUseCase } from './get-estimation-questionnaire-definition.use-case';

describe('GetEstimationQuestionnaireDefinitionUseCase', () => {
  it('mantiene el cuestionario base dentro del objetivo de fricción', () => {
    const result = new GetEstimationQuestionnaireDefinitionUseCase().execute();

    expect(result.fixedQuestions).toHaveLength(5);
    expect(result.maxDynamicFirstRound).toBe(5);
    expect(result.maxDynamicFollowUp).toBe(2);
    expect(result.targetMinutesMax).toBeLessThanOrEqual(5);
  });

  it('deja el contexto adicional como pregunta opcional', () => {
    const result = new GetEstimationQuestionnaireDefinitionUseCase().execute();
    const additionalContext = result.fixedQuestions.find((question) => question.id === 'F05');

    expect(additionalContext?.required).toBe(false);
    expect(additionalContext?.answerType).toBe('text');
  });
});
