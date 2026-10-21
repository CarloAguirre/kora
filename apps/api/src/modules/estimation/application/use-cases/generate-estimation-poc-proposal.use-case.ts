import { Inject, Injectable } from '@nestjs/common';
import {
  estimationPocAiDraftSchema,
  estimationPocProposalSchema,
  type EstimationPocProposal,
  type GenerateEstimationPocInput,
} from '@kora/contracts';
import { AI_PROVIDER, type AiProvider } from '../../../ai/application/ports/ai-provider.port';

@Injectable()
export class GenerateEstimationPocProposalUseCase {
  constructor(@Inject(AI_PROVIDER) private readonly ai: AiProvider) {}

  async execute(input: GenerateEstimationPocInput): Promise<EstimationPocProposal> {
    const draft = estimationPocAiDraftSchema.parse(
      await this.ai.generateStructured({
        task: 'estimation.poc.proposal',
        context: {
          projectId: input.projectId,
          projectName: input.projectName,
          clientName: input.clientName,
          driveFolderUrl: input.driveFolderUrl,
          answers: input.answers,
        },
        instructions: input.instructions,
      }),
    );

    const roles = draft.roles.map((role) => ({
      ...role,
      totalHours: roundHours(role.duration * role.hoursPerUnit * role.people),
    }));
    const totalHours = roundHours(roles.reduce((sum, role) => sum + role.totalHours, 0));

    return estimationPocProposalSchema.parse({
      projectId: input.projectId,
      provider: 'poc-ai',
      sourceMode: 'poc_simulated',
      documentsAnalyzed: 0,
      summary: draft.summary,
      roles,
      totalHours,
      assumptions: draft.assumptions,
      clarifyingQuestions: draft.clarifyingQuestions,
    });
  }
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}
