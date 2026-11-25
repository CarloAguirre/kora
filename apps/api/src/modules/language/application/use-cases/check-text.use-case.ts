import { Inject, Injectable } from '@nestjs/common';
import { LOGGER, ok, type Logger, type Result } from '@kora/core';
import type { LanguageCheckResult } from '@kora/contracts';
import type { UseCase } from '../../../../shared/application/use-case';
import { GRAMMAR_CHECKER, type GrammarChecker } from '../ports/grammar-checker.port';

export interface CheckTextCommand {
  readonly text: string;
}

/**
 * Revisión gramatical de lo que se está escribiendo en un campo de texto.
 *
 * Nunca falla hacia el front: si el corrector no responde (caído, lento,
 * sin configurar), se devuelve "sin observaciones" y se deja constancia en
 * el log. Es una ayuda al escribir — que se caiga no puede impedir guardar un
 * registro de horas, y la ortografía básica la sigue marcando el front solo.
 */
@Injectable()
export class CheckTextUseCase implements UseCase<CheckTextCommand, LanguageCheckResult, never> {
  constructor(
    @Inject(GRAMMAR_CHECKER) private readonly checker: GrammarChecker,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async execute({ text }: CheckTextCommand): Promise<Result<LanguageCheckResult, never>> {
    if (text.trim() === '') return ok({ issues: [] });

    try {
      const issues = await this.checker.check(text);
      return ok({
        issues: issues
          .filter((issue) => issue.kind !== 'spelling')
          .map(({ offset, length, message, replacements }) => ({ offset, length, message, replacements: [...replacements] })),
      });
    } catch (error) {
      this.logger.warn('No se pudo revisar la gramática del texto.', {
        error: error instanceof Error ? error.message : String(error),
      });
      return ok({ issues: [] });
    }
  }
}
