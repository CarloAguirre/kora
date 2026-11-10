import { Logger, Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { AI_PROVIDER, type AiProvider } from './application/ports/ai-provider.port';
import { GeminiAiProvider } from './infrastructure/gemini-ai.provider';
import { OpenAiProvider } from './infrastructure/openai-ai.provider';
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
    OpenAiProvider,
    {
      provide: AI_PROVIDER,
      inject: [AppConfigService, GeminiAiProvider, OpenAiProvider, PocAiProvider],
      useFactory: (
        config: AppConfigService,
        gemini: GeminiAiProvider,
        openai: OpenAiProvider,
        poc: PocAiProvider,
      ): AiProvider => {
        const settings = config.ai;
        if (settings.provider === 'openai') {
          if (!settings.openaiApiKey)
            throw new Error('AI_PROVIDER=openai requiere OPENAI_API_KEY en el backend.');
          Logger.log('Proveedor IA activo: openai · modelo: ' + settings.openaiModel, 'AiModule');
          return openai;
        }
        if (settings.provider === 'gemini') {
          if (!settings.geminiApiKey)
            throw new Error('AI_PROVIDER=gemini requiere GEMINI_API_KEY.');
          Logger.log('Proveedor IA activo: gemini · modelo: ' + settings.geminiModel, 'AiModule');
          return gemini;
        }
        if (settings.provider === 'poc') {
          Logger.log('Proveedor IA activo: simulación local', 'AiModule');
          return poc;
        }
        const selected = settings.geminiApiKey ? gemini : poc;
        Logger.log('Proveedor IA activo: ' + selected.name +
          ' · AI_PROVIDER=auto', 'AiModule');
        return selected;
      },
    },
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
