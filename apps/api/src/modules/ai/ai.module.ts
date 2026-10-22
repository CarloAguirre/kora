import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { AI_PROVIDER, type AiProvider } from './application/ports/ai-provider.port';
import { GeminiAiProvider } from './infrastructure/gemini-ai.provider';
import { PocAiProvider } from './infrastructure/poc-ai.provider';

/**
 * Módulo técnico de IA.
 *
 * Con GEMINI_API_KEY utiliza Gemini. Sin key conserva el proveedor determinístico
 * para que la API pueda arrancar y el resto de Kora no dependa de una credencial
 * externa durante desarrollo.
 */
@Module({
  providers: [
    PocAiProvider,
    GeminiAiProvider,
    {
      provide: AI_PROVIDER,
      inject: [AppConfigService, GeminiAiProvider, PocAiProvider],
      useFactory: (
        config: AppConfigService,
        gemini: GeminiAiProvider,
        poc: PocAiProvider,
      ): AiProvider => (config.ai.enabled ? gemini : poc),
    },
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
