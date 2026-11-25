import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { GRAMMAR_CHECKER } from './application/ports/grammar-checker.port';
import { CheckTextUseCase } from './application/use-cases/check-text.use-case';
import { DisabledGrammarChecker, LanguageToolGrammarChecker } from './infrastructure/languagetool.grammar-checker';
import { LanguageController } from './presentation/language.controller';

/**
 * Revisión gramatical de texto libre para el corrector del front
 * (`apps/web/src/shared/spellcheck`): tildes según el contexto, concordancia,
 * puntuación. Sin persistencia propia.
 */
@Module({
  controllers: [LanguageController],
  providers: [
    CheckTextUseCase,
    {
      provide: GRAMMAR_CHECKER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const { url } = config.languageTool;
        return url ? new LanguageToolGrammarChecker(url) : new DisabledGrammarChecker();
      },
    },
  ],
})
export class LanguageModule {}
