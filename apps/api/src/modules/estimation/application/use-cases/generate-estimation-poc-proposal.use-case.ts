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


/**
 * Una fila = actividad WBS × perfil. Una actividad con 3 perfiles se devuelve
 * en 3 filas con el mismo WBS. Evita tres niveles de arrays en responseSchema
 * (Gemini Flash-Lite rechaza estructuras complejas con INVALID_ARGUMENT).
 * Kora agrupa filas y calcula los totales sin redistribución proporcional.
 */
const detailResponseSchema = z.object({
  reservePercent: z.number().min(0).max(100),
  activities: z.array(z.object({
    wbs: z.string().trim().min(1).max(40),
    stageCode: z.string().trim().min(1).max(40),
    stageName: z.string().trim().min(1).max(300),
    startWeek: z.number().int().min(1).max(520),
    durationWeeks: z.number().int().min(1).max(520),
    module: z.string().trim().min(1).max(300),
    submodule: z.string().trim().max(300),
    name: z.string().trim().min(1).max(300),
    description: z.string().trim().max(3000),
    role: z.string().trim().min(1).max(120),
    hours: z.number().positive().max(1000000),
    references: z.string().trim().max(1000),
    classification: z.string().trim().max(40),
  })).min(1).max(240),
});

const EDT_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reservePercent: { type: 'NUMBER' },
    activities: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          wbs: { type: 'STRING' },
          stageCode: { type: 'STRING' },
          stageName: { type: 'STRING' },
          startWeek: { type: 'NUMBER' },
          durationWeeks: { type: 'NUMBER' },
          module: { type: 'STRING' },
          submodule: { type: 'STRING' },
          name: { type: 'STRING' },
          description: { type: 'STRING' },
          role: { type: 'STRING' },
          hours: { type: 'NUMBER' },
          references: { type: 'STRING' },
          classification: { type: 'STRING' },
        },
        required: ['wbs', 'stageCode', 'stageName', 'startWeek', 'durationWeeks',
          'module', 'submodule', 'name', 'description', 'role', 'hours',
          'references', 'classification'],
      },
    },
  },
  required: ['reservePercent', 'activities'],
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
   * Gemini estima HH por actividad y perfil: la EDT v2 es la fuente de
   * esfuerzo. No prorrateamos un presupuesto previo; consolidamos sus filas.
   * Tramos semanales son relativos y no representan un cronograma aprobado.
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
    const raw = detailResponseSchema.parse(await this.ai.generateStructured({
      task: 'estimation.poc.reference-edt',
      context: {
        projectId: input.projectId,
        projectName: input.projectName,
        provider: 'gemini',
        source: 'kdm_demo',
        answers: input.answers,
        confirmedUnderstanding: 'confirmedUnderstanding' in input ? input.confirmedUnderstanding : null,
        allowedRoles: proposal.roles.map((role) => ({
          role: role.role, people: role.people,
          estimatedDuration: role.duration, unit: role.unit,
        })),
      },
      instructions: [
        'Genera una EDT comercial DETALLADA basada en los documentos KDM y respuestas, siguiendo la estructura de un EDT profesional.',
        'Cada fila de activities representa un cruce WBS×perfil; si una misma actividad requiere 2 perfiles, repite el mismo WBS y metadatos con distinto role y hours.',
        'Estima las horas de ejecución de cada actividad por perfil en base a su complejidad y alcance. No hagas que sumen un total predeterminado.',
        'Solo utiliza role que coincida EXACTAMENTE con allowedRoles. Cada perfil declarado debe intervenir en al menos una actividad real.',
        'No inventes funciones fuera del alcance: separa explícitamente exclusiones y supuestos en la descripción.',
        'Agrupa actividades en módulos funcionales (module), submódulos (submodule) y tramos cronológicos (stageCode, stageName). Un tramo puede abarcar varios módulos y perfiles.',
        'startWeek y durationWeeks son rangos SEMANALES RELATIVOS y estimativos, nunca fechas del proyecto; los tramos pueden solaparse con trabajo paralelo.',
        'WBS debe ser único por ACTIVIDAD; solo puedes repetirlo cuando varias filas son perfiles distintos de la MISMA actividad.',
        'Para un WBS repetido, name, description, stageCode, stageName, startWeek, durationWeeks, module, submodule, references y classification deben coincidir.',
        'references: códigos o referencias verificables del documento separados por punto y coma; cadena vacía si no existe fuente explícita.',
        'classification: categoría resumida según la evidencia, o cadena vacía si no aplica.',
        'hours siempre mayores a 0 y con hasta dos decimales. No inventes personas, responsables nominales ni estados de ejecución.',
        'reservePercent: solo usa el porcentaje expresamente pedido en el documento o cuestionario; si no aparece, devuelve 0. La reserva no integra las HH base.',
        'Máximo 20 módulos, 120 actividades WBS únicas, 20 tramos y 240 filas WBS×perfil.',
        'Evita entregables genéricos; describe actividades que un desarrollador o QA pueda implementar y revisar.',
        'El EDT de Zurich sirve de patrón de estructura, no de presupuesto para KDM: no reutilices sus horas ni su reserva.',
      ].join('\n'),
      documents: docs.map((doc) => ({
        name: doc.name, mimeType: doc.mimeType,
        ...(doc.text ? { text: doc.text } : {}),
        ...(doc.dataBase64 ? { dataBase64: doc.dataBase64 } : {}),
      })),
      responseJsonSchema: EDT_JSON_SCHEMA,
    }));

    type Activity = typeof raw.activities[number];
    const roles = new Set(proposal.roles.map((role) => role.role));
    const stages = new Map<string, {
      code: string; name: string; startWeek: number; durationWeeks: number; totalHours: number;
    }>();
    const activities = new Map<string, {
      row: Activity; roleEffort: { role: string; hours: number }[];
    }>();
    for (const row of raw.activities) {
      if (!roles.has(row.role) || roundHours(row.hours) !== row.hours) {
        throw new BadRequestException('La EDT incluye perfiles ajenos o HH con más de dos decimales.');
      }
      const stage = stages.get(row.stageCode);
      if (stage && (stage.name !== row.stageName ||
          stage.startWeek !== row.startWeek ||
          stage.durationWeeks !== row.durationWeeks)) {
        throw new BadRequestException('El tramo cronológico contiene periodos contradictorios.');
      }
      if (!stage) {
        stages.set(row.stageCode, {
          code: row.stageCode, name: row.stageName,
          startWeek: row.startWeek, durationWeeks: row.durationWeeks, totalHours: 0,
        });
      }
      const current = activities.get(row.wbs);
      if (current) {
        const original = current.row;
        if (current.roleEffort.some((item) => item.role === row.role) ||
            ['stageCode', 'stageName', 'startWeek', 'durationWeeks', 'module',
             'submodule', 'name', 'description', 'references', 'classification']
              .some((field) => original[field as keyof Activity] !== row[field as keyof Activity])) {
          throw new BadRequestException('El WBS repetido tiene perfiles duplicados o datos inconsistentes.');
        }
        current.roleEffort.push({ role: row.role, hours: row.hours });
      } else {
        activities.set(row.wbs, { row, roleEffort: [{ role: row.role, hours: row.hours }] });
      }
    }
    if (activities.size > 120 || stages.size > 20 ||
        proposal.roles.some((role) => !raw.activities.some((row) => row.role === role.role))) {
      throw new BadRequestException('La EDT no cubre todos los perfiles o excede el límite de actividades.');
    }
    const modulesByName = new Map<string, {
      name: string;
      tasks: {
        wbs: string; name: string; description: string; role: string; hours: number;
        stageCode: string; submodule: string; referenceIds: string[];
        classification: string; roleEffort: { role: string; hours: number }[];
      }[];
      totalHours: number;
    }>();
    for (const [wbs, { row, roleEffort }] of activities) {
      const key = row.module.toLocaleLowerCase('es');
      const module = modulesByName.get(key) ?? { name: row.module, tasks: [], totalHours: 0 };
      const hours = roundHours(roleEffort.reduce((sum, part) => sum + part.hours, 0));
      const primary = [...roleEffort].sort((a, b) => b.hours - a.hours)[0]!;
      module.tasks.push({
        wbs, name: row.name, description: row.description,
        role: primary.role, hours, stageCode: row.stageCode,
        submodule: row.submodule,
        referenceIds: [...new Set(row.references.split(/[;,]/).map((ref) => ref.trim()).filter(Boolean))],
        classification: row.classification, roleEffort,
      });
      module.totalHours = roundHours(module.totalHours + hours);
      modulesByName.set(key, module);
      const stage = stages.get(row.stageCode)!;
      stage.totalHours = roundHours(stage.totalHours + hours);
    }
    if (modulesByName.size > 20 ||
        [...modulesByName.values()].some((module) => module.tasks.length > 80)) {
      throw new BadRequestException('La EDT excede el máximo de módulos o actividades por módulo.');
    }
    const modules = [...modulesByName.values()];
    const totalHours = roundHours(modules.reduce((sum, module) => sum + module.totalHours, 0));
    const reservePercent = raw.reservePercent;
    const reserveHours = roundHours(totalHours * reservePercent / 100);
    return quotationReferenceEdtSchema.parse({
      schemaVersion: 'kora.quotation.reference-edt.v2',
      source: 'kdm_demo', provider: 'gemini',
      modules, totalHours,
      stages: [...stages.values()].sort((a, b) =>
        a.startWeek - b.startWeek || a.code.localeCompare(b.code)),
      reservePercent, reserveHours,
      totalWithReserve: roundHours(totalHours + reserveHours),
    });
  }

  /** El balance de roles se deriva desde actividades, nunca se impone al EDT. */
  reconcileProposalWithEdt(
    preliminary: EstimationPocProposal, edt: QuotationReferenceEdt,
  ): EstimationPocProposal {
    if (edt.schemaVersion !== 'kora.quotation.reference-edt.v2') return preliminary;
    const byRole = new Map<string, number>();
    for (const module of edt.modules) {
      for (const task of module.tasks) {
        for (const item of task.roleEffort ?? []) {
          byRole.set(item.role, roundHours((byRole.get(item.role) ?? 0) + item.hours));
        }
      }
    }
    if (byRole.size !== preliminary.roles.length ||
        preliminary.roles.some((role) => !byRole.has(role.role))) {
      throw new BadRequestException('Los perfiles de la EDT no coinciden con la propuesta de capacidad.');
    }
    const roles = preliminary.roles.map((role) => {
      const totalHours = byRole.get(role.role)!;
      const units = role.duration * role.people;
      if (units <= 0) throw new BadRequestException('La capacidad preliminar incluye perfiles sin duración.');
      return {
        ...role, totalHours,
        // La tasa media se deriva de las HH reales; nunca vuelve a distribuirlas.
        hoursPerUnit: Math.round(totalHours / units * 10000) / 10000,
      };
    });
    return estimationPocProposalSchema.parse({
      ...preliminary, roles, totalHours: edt.totalHours,
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
