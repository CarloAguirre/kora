import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { extractDriveFolderId } from '../drive-source-selection';
import {
  estimationPocAiDraftSchema,
  quotationReferenceEdtSchema,
  type QuotationReferenceEdt,
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


/** Gemini genera la descomposición; Kora calcula las HH conservando la
 * propuesta de roles original, sin confiarle la aritmética al modelo.
 */
const edtResponseSchema = z.object({
  modules: z.array(z.object({
    name: z.string().trim().min(1).max(300),
    tasks: z.array(z.object({
      wbs: z.string().trim().min(1).max(40),
      name: z.string().trim().min(1).max(300),
      description: z.string().trim().max(3000).default(''),
      role: z.string().trim().min(1).max(120),
      weight: z.number().positive().max(1000000),
    })).min(1).max(60),
  })).min(1).max(30),
});
// El esquema transmitido a Gemini es deliberadamente mínimo. Modelos como
// Flash-Lite pueden rechazar con 400/INVALID_ARGUMENT esquemas anidados con
// límites minItems/maxItems/minimum. Las restricciones de cantidad, positividad,
// roles, WBS y preservación de HH se verifican aquí con Zod y reglas de negocio.
const EDT_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    modules: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          tasks: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                wbs: { type: 'STRING' },
                name: { type: 'STRING' },
                description: { type: 'STRING' },
                role: { type: 'STRING' },
                weight: { type: 'NUMBER' },
              },
              required: ['wbs', 'name', 'description', 'role', 'weight'],
            },
          },
        },
        required: ['name', 'tasks'],
      },
    },
  },
  required: ['modules'],
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

  /**
   * Segundo procesamiento Gemini: crea EDT a nivel de módulos y tareas.
   * La distribución de HH por rol es exacta y se hace con aritmética
   * determinista. Una respuesta inconsistente NO se guarda.
   */
  async generateEdt(
    input: GenerateEstimationPocInput,
    proposal: EstimationPocProposal,
  ): Promise<QuotationReferenceEdt> {
    if (this.ai.name !== 'gemini' || proposal.provider !== 'gemini' ||
        proposal.projectId !== input.projectId ||
        extractDriveFolderId(input.driveFolderUrl) !== 'kora-poc-fallback') {
      throw new BadRequestException('EDT KDM solo admite la propuesta Gemini de la misma cotización.');
    }
    const docs = await this.sources.readDriveSources(input.driveFolderUrl);
    if (docs.length !== 1 || docs[0]?.name !== 'Requerimiento_KDM.pdf') {
      throw new BadRequestException('No se pudo comprobar el documento KDM de demostración.');
    }
    const raw = edtResponseSchema.parse(await this.ai.generateStructured({
      task: 'estimation.poc.reference-edt',
      context: {
        projectId: input.projectId,
        projectName: input.projectName,
        provider: 'gemini',
        source: 'kdm_demo',
        answers: input.answers,
        confirmedUnderstanding: 'confirmedUnderstanding' in input ? input.confirmedUnderstanding : null,
        roles: proposal.roles.map((role) => ({ name: role.role, totalHours: role.totalHours })),
      },
      instructions: [
        'Desglosa el alcance del documento KDM en módulos/fases y tareas de referencia concretas.',
        'Si hay entendimiento confirmado por el usuario en el contexto, úsalo para resolver ambigüedades del documento.',
        'Cada tarea debe tener un único role que coincida EXACTAMENTE con uno de los roles del contexto.',
        'Usa weight relativo > 0 para repartir el trabajo de CADA rol entre tareas.',
        'No calcules HH: Kora distribuye las HH de la propuesta original de manera determinista.',
        'No inventes módulos no sustentados por el documento; indica las incertidumbres en la descripción.',
        'Cada WBS debe ser único en toda la EDT.',
        'No asignes fechas, personas ni estados de ejecución. Devuelve exclusivamente la estructura.',
        'Máximo 20 módulos y 120 tareas en total, con al menos una tarea por perfil.',
      ].join('\n'),
      documents: docs.map((doc) => ({
        name: doc.name, mimeType: doc.mimeType,
        ...(doc.text ? { text: doc.text } : {}),
        ...(doc.dataBase64 ? { dataBase64: doc.dataBase64 } : {}),
      })),
      responseJsonSchema: EDT_JSON_SCHEMA,
    }));
    const entries = raw.modules.flatMap((module) => module.tasks);
    if (raw.modules.length > 20 || entries.length > 120) {
      throw new BadRequestException('La EDT excede el alcance máximo de análisis.');
    }
    const names = new Set(raw.modules.map((module) => module.name.toLowerCase()));
    const uniqueWbs = new Set(entries.map((task) => task.wbs));
    if (names.size !== raw.modules.length || uniqueWbs.size !== entries.length) {
      throw new BadRequestException('La EDT contiene fases o códigos WBS duplicados.');
    }
    const validRoles = new Map(proposal.roles.map((role) => [role.role, role]));
    if (validRoles.size !== proposal.roles.length ||
        entries.some((task) => !validRoles.has(task.role))) {
      throw new BadRequestException('Las tareas deben referirse a perfiles únicos cotizados por Gemini.');
    }
    const allocated = new Map<string, number>();
    const shares = new Map<string, number>();
    for (const task of entries) {
      shares.set(task.role, (shares.get(task.role) ?? 0) + task.weight);
    }
    const hoursByWbs = new Map<string, number>();
    for (const role of proposal.roles) {
      const tasks = entries.filter((task) => task.role === role.role);
      if (!tasks.length) throw new BadRequestException('La EDT omite el perfil ' + role.role);
      const weightSum = shares.get(role.role)!;
      let assigned = 0;
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i]!;
        const hours = i === tasks.length - 1
          ? roundHours(role.totalHours - assigned)
          : roundHours(role.totalHours * task.weight / weightSum);
        if (hours <= 0) throw new BadRequestException(
          'La distribución generó tareas sin HH; simplifica el desglose.',
        );
        hoursByWbs.set(task.wbs, hours);
        assigned = roundHours(assigned + hours);
      }
      allocated.set(role.role, assigned);
      if (Math.abs(assigned - role.totalHours) > 0.011) {
        throw new BadRequestException('La EDT no conserva las HH de ' + role.role);
      }
    }
    const modules = raw.modules.map((module) => {
      const tasks = module.tasks.map((task) => ({
        wbs: task.wbs, name: task.name,
        description: task.description, role: task.role,
        hours: hoursByWbs.get(task.wbs)!,
      }));
      return {
        name: module.name,
        tasks,
        totalHours: roundHours(tasks.reduce((sum, task) => sum + task.hours, 0)),
      };
    });
    const totalHours = roundHours(modules.reduce((sum, module) => sum + module.totalHours, 0));
    if (Math.abs(totalHours - proposal.totalHours) > 0.011) {
      throw new BadRequestException('La EDT calculada no coincide con las HH propuestas.');
    }
    return quotationReferenceEdtSchema.parse({
      schemaVersion: 'kora.quotation.reference-edt.v1',
      source: 'kdm_demo',
      provider: 'gemini',
      modules,
      totalHours,
    });
  }

  async execute(
    input: GenerateEstimationPocInput,
  ): Promise<EstimationPocProposal> {
    const documents =
      this.ai.name === 'poc-ai'
        ? []
        : await this.sources.readDriveSources(input.driveFolderUrl);

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
          confirmedUnderstanding: 'confirmedUnderstanding' in input ? input.confirmedUnderstanding : null,
          sourceDocuments: documents.map((document) => ({
            sourceId: document.sourceId,
            name: document.name,
            path: document.path,
            mimeType: document.mimeType,
          })),
        },
        instructions: [
          BASE_INSTRUCTIONS,
          'confirmedUnderstanding' in input && input.confirmedUnderstanding
            ? `Entendimiento corregido y confirmado por el usuario (dar prioridad frente a inferencias del documento):\n${input.confirmedUnderstanding}`
            : '',
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
      sourceMode: this.ai.name === 'poc-ai' ||
        extractDriveFolderId(input.driveFolderUrl) === 'kora-poc-fallback'
        ? 'poc_simulated' : 'drive',
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
