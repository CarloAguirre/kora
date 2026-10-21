import { Module } from '@nestjs/common';
import { AI_PROVIDER } from './application/ports/ai-provider.port';
import { PocAiProvider } from './infrastructure/poc-ai.provider';

/**
 * Módulo técnico de IA.
 *
 * Expone una abstracción a los módulos de negocio. Durante la PoC usa un
 * proveedor determinístico; posteriormente podrá registrar OpenAI, Azure
 * OpenAI u otro adaptador sin acoplar Calculadora a ese SDK.
 */
@Module({
  providers: [
    PocAiProvider,
    { provide: AI_PROVIDER, useExisting: PocAiProvider },
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
