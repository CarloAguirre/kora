import { Inject, Injectable } from '@nestjs/common';
import {
  estimationPocAnalysisSchema,
  type AnalyzeEstimationPocInput,
  type EstimationPocAnalysis,
} from '@kora/contracts';
import { AI_PROVIDER, type AiProvider } from '../../../ai/application/ports/ai-provider.port';

@Injectable()
export class AnalyzeEstimationPocUseCase {
  constructor(@Inject(AI_PROVIDER) private readonly ai: AiProvider) {}

  async execute(input: AnalyzeEstimationPocInput): Promise<EstimationPocAnalysis> {
    const draft = await this.ai.generateStructured({
      task: 'estimation.poc.analysis',
      context: {
        projectId: input.projectId,
        projectName: input.projectName,
        clientName: input.clientName,
        driveFolderUrl: input.driveFolderUrl,
      },
      instructions: input.instructions,
    });

    return estimationPocAnalysisSchema.parse({
      projectId: input.projectId,
      provider: 'poc-ai',
      sourceMode: 'poc_simulated',
      documentsAnalyzed: 0,
      ...(draft as object),
    });
  }
}
