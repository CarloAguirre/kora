import type { ProjectEstimationContext } from '@kora/contracts';
import type { ProjectSourceDocument } from './document-source-reader.port';

export const AI_PROJECT_ANALYZER = Symbol('AI_PROJECT_ANALYZER');

export interface AnalyzeProjectInput {
  readonly projectId: string;
  readonly documents: readonly ProjectSourceDocument[];
}

export interface AiProjectAnalyzer {
  analyze(input: AnalyzeProjectInput): Promise<ProjectEstimationContext>;
}
