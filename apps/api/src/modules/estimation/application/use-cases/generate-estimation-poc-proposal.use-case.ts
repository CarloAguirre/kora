import { Inject, Injectable } from '@nestjs/common';
import {
  estimationPocAiDraftSchema,
  estimationPocProposalSchema,
  type EstimationPocProposal,
  type GenerateEstimationPocInput,
} from '@kora/contracts';
import {
  AI_PROVIDER,
  type AiProvider,
} from '../../../ai/application/ports/ai-provider.port';
import {
  DOCUMENT_SOURCE_READER,
  type DocumentSourceReader,
} from '../ports/document-source-reader.port';

const TEAM_ESTIMATE_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: {
      type: 'STRING',
      description:
        'Resumen breve del alcance entendido y de la estrategia general de estimación.',
    },
    roles: {
      type: 'ARRAY',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'OBJECT',
        properties: {
          role: {
            type: 'STRING',
            description: 'Nombre del rol o perfil requerido.',
          },
          unit: {
            type: 'STRING',
            enum: ['week', 'day'],
          },
          duration: {
            type: 'NUMBER',
            minimum: 0,
            description: 'Cantidad de semanas o días según unit.',
          },
          hoursPerUnit: {
            type: 'NUMBER',
            minimum: 0,
            description:
              'Horas de dedicación de una persona por cada unidad de duración.',
          },
          people: {
            type: 'NUMBER',
            minimum: 1,
            description: 'Cantidad de personas de este rol.',
          },
          source: {
            type: 'STRING',
            description:
              'Justificación breve basada en documentos o en un supuesto explícito.',
          },
        },
        required: [
          'role',
          'unit',
          'duration',
          'hoursPerUnit',
          'people',
          'source',
        ],
      },
    },
    assumptions: {
      type: 'ARRAY',
      maxItems: 8,
      items: { type: 'STRING' },
    },
    clarifyingQuestions: {
      type: 'ARRAY',
      maxItems: 5,
      items: { type: 'STRING' },
    },
  },
  required: ['summary', 'roles', 'assumptions', 'clarifyingQuestions'],
} as const;

const BASE_INSTRUCTIONS = [
  'Analiza únicamente los antecedentes adjuntos y el contexto entregado.',
  'Esta es una prueba de concepto liviana: estima solo a nivel de equipos/roles.',
  'NO generes EDT, tareas, requerimientos, historias de usuario ni casos de uso.',
  'Propón solo perfiles que estén justificados por los documentos o por una necesidad técnica evidente.',
  'Para cada rol devuelve unidad (week o day), duración, horas por unidad y cantidad de personas.',
  'No calcules HH totales: Kora realizará esa aritmética de forma determinística.',
  'En source cita el nombre del documento que sustenta la decisión; si no existe evidencia directa, indica que es un supuesto técnico.',
  'Cuando falte información, documenta el supuesto en assumptions en vez de inventar funcionalidades.',
  'Los roles habituales pueden incluir Desarrollo, Tech Lead/Líder, QA, Arquitectura, UX/UI, IA, RPA o PMO, pero no es obligatorio incluirlos todos.',
  'Devuelve una propuesta razonable para dimensionamiento inicial comercial, no un compromiso definitivo.',
].join('\n');

@Injectable()
export class GenerateEstimationPocProposalUseCase {
  constructor(
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    @Inject(DOCUMENT_SOURCE_READER)
    private readonly sources: DocumentSourceReader,
  ) {}

  async execute(
    userId: string,
    input: GenerateEstimationPocInput,
  ): Promise<EstimationPocProposal> {
    const documents =
      this.ai.name === 'poc-ai'
        ? []
        : await this.sources.readDriveSources(
            userId,
            input.driveFolderUrl,
          );

    if (this.ai.name !== 'poc-ai' && documents.length === 0) {
      throw new Error(
        'La carpeta no contiene documentos compatibles para la PoC. Usa PDF, Google Docs, Sheets, Slides o archivos de texto/CSV.',
      );
    }

    const draft = estimationPocAiDraftSchema.parse(
      await this.ai.generateStructured({
        task: 'estimation.poc.proposal',
        context: {
          projectId: input.projectId,
          projectName: input.projectName,
          clientName: input.clientName,
          estimationLevel: 'team_roles_only',
          answers: input.answers,
          sourceDocuments: documents.map((document) => ({
            sourceId: document.sourceId,
            name: document.name,
            path: document.path,
            mimeType: document.mimeType,
          })),
        },
        instructions: [
          BASE_INSTRUCTIONS,
          input.instructions
            ? `Indicaciones del usuario:\n${input.instructions}`
            : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        documents: documents.map((document) => ({
          name: document.name,
          mimeType: document.mimeType,
          ...(document.text ? { text: document.text } : {}),
          ...(document.dataBase64
            ? { dataBase64: document.dataBase64 }
            : {}),
        })),
        responseJsonSchema: TEAM_ESTIMATE_RESPONSE_SCHEMA,
      }),
    );

    const roles = draft.roles.map((role) => ({
      ...role,
      totalHours: roundHours(
        role.duration * role.hoursPerUnit * role.people,
      ),
    }));
    const totalHours = roundHours(
      roles.reduce((sum, role) => sum + role.totalHours, 0),
    );

    return estimationPocProposalSchema.parse({
      projectId: input.projectId,
      provider: this.ai.name,
      sourceMode: this.ai.name === 'poc-ai' ? 'poc_simulated' : 'drive',
      documentsAnalyzed:
        this.ai.name === 'poc-ai' ? 0 : documents.length,
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
