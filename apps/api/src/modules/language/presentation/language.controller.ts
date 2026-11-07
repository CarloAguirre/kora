import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { languageCheckRequestSchema, type LanguageCheckRequest, type LanguageCheckResult } from '@kora/contracts';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import { CheckTextUseCase } from '../application/use-cases/check-text.use-case';

/** Sin `@RequirePermissions`: cualquier usuario autenticado escribe en algún campo de texto. */
@Controller('language')
export class LanguageController {
  constructor(private readonly checkText: CheckTextUseCase) {}

  /** POST y no GET: el texto puede ser largo y no debe quedar en logs de URLs. */
  @Post('check')
  @HttpCode(HttpStatus.OK)
  async check(
    @Body(new ZodValidationPipe(languageCheckRequestSchema)) body: LanguageCheckRequest,
  ): Promise<LanguageCheckResult> {
    return unwrapOrThrow(await this.checkText.execute({ text: body.text }));
  }
}
