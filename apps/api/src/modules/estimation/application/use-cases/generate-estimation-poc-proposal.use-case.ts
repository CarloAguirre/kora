import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { extractDriveFolderId } from '../drive-source-selection';
import { resolveEstimationQuestionnaireContext, type EstimationInputWithQuestions } from '../resolve-estimation-questionnaire-context';
import {
  ESTIMATION_METHODOLOGY_VERSION,
  ESTIMATION_TEAM_GUIDANCE,
  ESTIMATION_EDT_GUIDANCE,
  TECH_LEAD_HOURS_PER_WEEK,
  isTechLeadRole,
  isCompatibleTechLeadTeam,
  estimatedWeeksFromRoles,
  addMandatoryTechLeadSupervision,
  validateStageCapacity,
} from '../estimation-methodology';
import {
  estimationPocAiDraftSchema,
  quotationReferenceEdtSchema,
  type QuotationReferenceEdt,
  estimationPocProposalSchema,
  type EstimationPocProposal,
} from '@kora/contracts';

/** IDs y nombres leídos del catálogo activo en PostgreSQL; no son perfiles IA. */
type KoraActiveTeam = { teamId: string; name: string };
import {
  AI_PROVIDER,
  type AiProvider,
} from '../../../ai/application/ports/ai-provider.port';
import {
  DOCUMENT_SOURCE_READER,
  type DocumentSourceReader,
  readEstimationDocuments,
  describeDocumentCoverage,
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
 * Tres tablas planas, sin subarrays: tramo, actividad única por WBS y HH
 * por cruce WBS×perfil. Así no se repiten ni los textos de tareas ni los
 * periodos de los tramos en cada línea generada por Gemini.
 *
 * El esquema ofrecido a Flash-Lite usa solo objetos y arrays de UN nivel,
 * evitando INVALID_ARGUMENT de estructuras profundamente anidadas.
 */
const detailResponseSchema = z.object({
  reservePercent: z.number().min(0).max(100),
  stages: z.array(z.object({
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(300),
    startWeek: z.number().int().min(1).max(520),
    durationWeeks: z.number().int().min(1).max(520),
  })).min(1).max(20),
  activities: z.array(z.object({
    wbs: z.string().trim().min(1).max(40),
    stageCode: z.string().trim().min(1).max(40),
    module: z.string().trim().min(1).max(300),
    submodule: z.string().trim().max(300),
    name: z.string().trim().min(1).max(300),
    description: z.string().trim().max(3000),
    references: z.string().trim().max(1000),
    classification: z.string().trim().max(40),
  })).min(1).max(120),
  roleHours: z.array(z.object({
    wbs: z.string().trim().min(1).max(40),
    role: z.string().trim().min(1).max(120),
    hours: z.number().positive().max(1000000),
  })).min(1).max(240),
});

const EDT_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reservePercent: { type: 'NUMBER' },
    stages: {
      type: 'ARRAY',
      description: 'Una única definición para cada tramo cronológico; no repetir en actividades.',
      items: {
        type: 'OBJECT',
        properties: {
          code: { type: 'STRING' }, name: { type: 'STRING' },
          startWeek: { type: 'NUMBER' }, durationWeeks: { type: 'NUMBER' },
        },
        required: ['code', 'name', 'startWeek', 'durationWeeks'],
      },
    },
    activities: {
      type: 'ARRAY',
      description: 'Una actividad por WBS único, sin perfiles ni HH repetidos.',
      items: {
        type: 'OBJECT',
        properties: {
          wbs: { type: 'STRING' }, stageCode: { type: 'STRING' },
          module: { type: 'STRING' }, submodule: { type: 'STRING' },
          name: { type: 'STRING' }, description: { type: 'STRING' },
          references: { type: 'STRING' }, classification: { type: 'STRING' },
        },
        required: ['wbs', 'stageCode', 'module', 'submodule', 'name',
          'description', 'references', 'classification'],
      },
    },
    roleHours: {
      type: 'ARRAY',
      description: 'HH individuales por pareja WBS y perfil. La pareja no debe repetirse.',
      items: {
        type: 'OBJECT',
        properties: {
          wbs: { type: 'STRING' }, role: { type: 'STRING' },
          hours: { type: 'NUMBER' },
        },
        required: ['wbs', 'role', 'hours'],
      },
    },
  },
  required: ['reservePercent', 'stages', 'activities', 'roleHours'],
} as const;

const BASE_INSTRUCTIONS = [
  'Analiza únicamente los antecedentes adjuntos y el contexto entregado.',
  'Esta es una prueba de concepto liviana: estima solo a nivel de equipos/roles.',
  'NO generes EDT, tareas, requerimientos, historias de usuario ni casos de uso.',
  'Propón solo perfiles que estén justificados por los documentos o por una necesidad técnica evidente.',
  'Usa nombres de rol únicos, sin repetir perfiles con distinta capitalización; duración, horas por unidad y cantidad de personas deben ser mayores que cero.',
  'Para cada rol devuelve unidad (week o day), duración, horas por unidad y cantidad de personas.',
  'No calcules HH totales: Kora realizará esa aritmética de forma determinística.',
  'En source cita el nombre del documento que sustenta la decisión; si no existe evidencia directa, indica que es un supuesto técnico.',
  'Interpreta decisiones de alcance desde context.resolvedAnswers: incluye la pregunta completa, la opción textual y los supuestos NO CONFIRMADOS. Nunca interpretes D01=yes por su código sin consultar el enunciado.',
  'Cuando falte información, documenta el supuesto en assumptions en vez de inventar funcionalidades.',
  'Los roles habituales pueden incluir Desarrollo, Tech Lead/Líder, QA, Arquitectura, UX/UI, IA, RPA o PMO, pero no es obligatorio incluirlos todos.',
  'Devuelve una propuesta razonable para dimensionamiento inicial comercial, no un compromiso definitivo.',
  ESTIMATION_TEAM_GUIDANCE,
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
    input: EstimationInputWithQuestions,
    proposal: EstimationPocProposal,
    activeKoraTeams?: readonly KoraActiveTeam[],
    authorizedSources?: DocumentSourceReader,
  ): Promise<QuotationReferenceEdt> {
    const isDemo = extractDriveFolderId(input.driveFolderUrl) === 'kora-poc-fallback';
    if (this.ai.name !== 'gemini' || proposal.provider !== 'gemini' ||
        proposal.projectId !== input.projectId ||
        proposal.sourceMode !== (isDemo ? 'poc_simulated' : 'drive')) {
      throw new BadRequestException('La EDT no corresponde al análisis Gemini de la carpeta seleccionada.');
    }
    this.validatePreliminaryRoles(proposal.roles);
    const loaded = await readEstimationDocuments(
      authorizedSources ?? this.sources, input.driveFolderUrl,
    );
    const docs = loaded.documents;
    const coverageNote = describeDocumentCoverage(loaded.coverage);
    if (docs.length === 0 || (isDemo && (docs.length !== 1 || docs[0]?.name !== 'Requerimiento_KDM.pdf'))) {
      throw new BadRequestException('No se pudieron comprobar antecedentes válidos de la carpeta documental.');
    }
    const request = {
      task: 'estimation.poc.reference-edt',
      context: {
        projectId: input.projectId,
        projectName: input.projectName,
        clientName: input.clientName,
        provider: 'gemini',
        source: isDemo ? 'kdm_demo' : 'drive',
        userInstructions: input.instructions,
        preliminaryAssumptions: proposal.assumptions,
        unresolvedPreliminaryQuestions: proposal.clarifyingQuestions,
        answers: input.answers,
        resolvedAnswers: resolveEstimationQuestionnaireContext(input),
        confirmedUnderstanding: 'confirmedUnderstanding' in input ? input.confirmedUnderstanding : null,
        allowedRoles: proposal.roles.map((role) => ({
          role: role.role, teamId: role.teamId ?? null, people: role.people,
          estimatedDuration: role.duration, unit: role.unit,
        })),
        ...(activeKoraTeams ? { activeKoraTeams } : {}),
        sourceCoverage: coverageNote,
      },
      instructions: [
        'Genera una EDT comercial DETALLADA basada en los documentos reales adjuntos y respuestas, siguiendo la estructura de un EDT profesional.',
        'Metodología vigente: ' + ESTIMATION_METHODOLOGY_VERSION + '.',
        ESTIMATION_EDT_GUIDANCE,
        'Devuelve 3 tablas planas: stages (cada tramo una sola vez), activities (cada WBS una sola vez) y roleHours (cada pareja WBS×perfil una sola vez).',
        'activities NO contiene role, hours ni la definición del tramo: solo stageCode como clave foránea hacia stages.',
        'Si una actividad necesita dos perfiles, escribe una sola fila en activities y DOS filas en roleHours con el mismo WBS y distintos role.',
        'Estima las horas por actividad y perfil en roleHours según su complejidad y alcance. No hagas que sumen un total predeterminado.',
        'Solo utiliza role que coincida EXACTAMENTE con allowedRoles. Cada perfil declarado debe intervenir en al menos una actividad real.',
        'No inventes funciones fuera del alcance: separa explícitamente exclusiones y supuestos en la descripción.',
        'Respeta las opciones seleccionadas y los supuestos de context.resolvedAnswers al definir actividades/HH; no confundas supuesto pendiente con decisión confirmada.',
        'Respeta context.userInstructions y distingue context.preliminaryAssumptions de decisiones confirmadas. Las preguntas preliminares sin resolver son incertidumbres, nunca autorizaciones para ampliar el alcance.',
        'Agrupa actividades en módulos funcionales (module), submódulos (submodule) y tramos cronológicos (stageCode, stageName). Un tramo puede abarcar varios módulos y perfiles.',
        'Cada stageCode de activities debe existir exactamente una vez en stages. Los periodos se definen SOLO en stages, nunca por actividad.',
        'startWeek y durationWeeks son rangos SEMANALES RELATIVOS y estimativos, nunca fechas del proyecto; los tramos pueden solaparse con trabajo paralelo.',
        'WBS es único dentro de activities; repetirlo en activities, incluso con datos idénticos, es un error.',
        'Cada roleHours debe referir a un WBS existente, su role debe coincidir EXACTAMENTE con allowedRoles y ninguna pareja WBS×role debe duplicarse.',
        'references: códigos o referencias verificables del documento separados por punto y coma; cadena vacía si no existe fuente explícita.',
        'classification: categoría resumida según la evidencia, o cadena vacía si no aplica.',
        'roleHours.hours siempre mayor a 0 y con hasta dos decimales. Cada actividad debe tener al menos un perfil. No inventes personas, responsables nominales ni estados de ejecución.',
        'reservePercent: solo usa el porcentaje expresamente pedido en el documento o cuestionario; si no aparece, devuelve 0. La reserva no integra las HH base.',
        'Máximo 20 módulos, 120 actividades WBS únicas, 20 tramos y 240 filas roleHours.',
        'Controla el tamaño de salida: para un proyecto de complejidad media busca unas 20 a 45 actividades WBS concretas; no fragmentes tareas triviales. Prioriza cubrir todo el alcance documentado sin exceder los límites de respuesta de Gemini.',
        'Evita entregables genéricos; describe actividades que un desarrollador o QA pueda implementar y revisar.',
        'No reutilices horas ni reservas de otros proyectos. Usa únicamente estos antecedentes y respuestas.',
        'Si context.sourceCoverage indica omisiones, no supongas que has recibido todos los requerimientos de Drive; evita inventar alcance no disponible.',
      ].join('\n'),
      documents: docs.map((doc) => ({
        name: doc.name, mimeType: doc.mimeType,
        ...(doc.text ? { text: doc.text } : {}),
        ...(doc.dataBase64 ? { dataBase64: doc.dataBase64 } : {}),
      })),
      responseJsonSchema: EDT_JSON_SCHEMA,
    };


    // Los artefactos generativos no son entradas determinísticas: si Gemini
    // incumple una condición verificable, le pedimos corregir SU salida una
    // única vez. Nunca saltamos validaciones ni reemplazamos HH con un fallback.
    // La cuota gratuita puede ser muy limitada. No gastar una segunda
    // solicitud a Gemini sin aprobación explícita de configuración.
    const maxAttempts = process.env.KORA_GEMINI_EDT_MAX_ATTEMPTS === '2' ? 2 : 1;
    let validationIssue = '';
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const output = await this.ai.generateStructured({
        ...request,
        instructions: attempt === 0 ? request.instructions : [
          request.instructions,
          'La EDT anterior fue rechazada por las validaciones del servidor.',
          'Rehaz la EDT desde la fuente original. Corrige exactamente este problema:',
          validationIssue,
          'Corrige las tres tablas: stages sin códigos repetidos; activities con un WBS único',
          'por actividad; roleHours con una sola pareja WBS×perfil, HH > 0 y dos decimales.',
          'Toda actividad debe referir a un tramo válido y tener HH de al menos un perfil.',
          'No transformes las HH para igualar una cifra preliminar.',
        ].join('\n'),
      });
      try {
        return this.buildVerifiedEdt(output, proposal, isDemo ? 'kdm_demo' : 'drive');
      } catch (error) {
        if (!(error instanceof BadRequestException) && !(error instanceof z.ZodError)) {
          throw error;
        }
        validationIssue = error instanceof z.ZodError
          ? error.issues.slice(0, 3).map((issue) =>
            issue.path.join('.') + ': ' + issue.message).join('; ')
          : error.message;
        if (attempt + 1 === maxAttempts) {
          throw new BadRequestException(
            (maxAttempts === 1
              ? 'Gemini devolvió una EDT inconsistente (sin reintento para ahorrar cuota): '
              : 'Gemini devolvió una EDT inconsistente tras el reintento: ') +
            validationIssue.slice(0, 250),
          );
        }
      }
    }
    throw new BadRequestException('Gemini no devolvió una EDT válida.');
  }

  /**
   * Reconciliación referencial estricta: no interpretamos textos diferentes
   * como la misma actividad ni inferimos HH desde metadatos incompletos.
   * Cada FK y cada cruce debe existir exactamente una vez.
   */
  private buildVerifiedEdt(
    output: unknown, proposal: EstimationPocProposal, source: 'kdm_demo' | 'drive',
  ): QuotationReferenceEdt {
    const parsed = detailResponseSchema.parse(output);
    const leadRoles = proposal.roles.filter((role) => isTechLeadRole(role.role));
    // La regla contractual se exige en cotizaciones reales. Los fixtures
    // PoC de la rama mantienen su estructura heredada para no falsear tests.
    if (source === 'drive' && leadRoles.length !== 1) {
      throw new BadRequestException(
        'La propuesta requiere exactamente un Líder Técnico para supervisión semanal. ' +
        'Verifica el catálogo de equipos y vuelve a generar la propuesta.',
      );
    }
    const raw = source === 'drive'
      ? addMandatoryTechLeadSupervision(parsed, leadRoles[0]!.role)
      : parsed;
    const validRoles = new Set(proposal.roles.map((role) => role.role));

    type Stage = {
      code: string; name: string; startWeek: number;
      durationWeeks: number; totalHours: number;
    };
    const stages = new Map<string, Stage>();
    for (const row of raw.stages) {
      if (stages.has(row.code)) {
        throw new BadRequestException('El tramo ' + row.code +
          ' está duplicado. Define cada tramo cronológico solo una vez.');
      }
      if (row.startWeek + row.durationWeeks - 1 > 520) {
        throw new BadRequestException(
          'El tramo ' + row.code +
          ' supera el horizonte máximo de 520 semanas (inicio + duración).',
        );
      }
      stages.set(row.code, { ...row, totalHours: 0 });
    }

    type Activity = typeof raw.activities[number];
    const activities = new Map<string, Activity>();
    for (const row of raw.activities) {
      if (activities.has(row.wbs)) {
        throw new BadRequestException('WBS duplicado en activities: ' +
          row.wbs + '. Cada actividad debe declararse una sola vez.');
      }
      if (!stages.has(row.stageCode)) {
        throw new BadRequestException('La actividad ' + row.wbs +
          ' referencia el tramo inexistente ' + row.stageCode + '.');
      }
      activities.set(row.wbs, row);
    }

    const effortByWbs = new Map<string, Array<{ role: string; hours: number }>>();
    const usedRoles = new Set<string>();
    for (const item of raw.roleHours) {
      if (!activities.has(item.wbs)) {
        throw new BadRequestException('Las HH del perfil ' + item.role +
          ' referencian un WBS inexistente: ' + item.wbs + '.');
      }
      if (!validRoles.has(item.role)) {
        throw new BadRequestException('Perfil ajeno a la propuesta: ' +
          item.role + ' en WBS ' + item.wbs + '.');
      }
      if (roundHours(item.hours) !== item.hours) {
        throw new BadRequestException('Las HH de ' + item.wbs + ' / ' +
          item.role + ' deben tener como máximo dos decimales.');
      }
      const effort = effortByWbs.get(item.wbs) ?? [];
      if (effort.some((row) => row.role === item.role)) {
        throw new BadRequestException('HH duplicadas: el perfil ' + item.role +
          ' aparece dos veces para WBS ' + item.wbs + '.');
      }
      effort.push({ role: item.role, hours: item.hours });
      effortByWbs.set(item.wbs, effort);
      usedRoles.add(item.role);
    }
    for (const role of validRoles) {
      if (!usedRoles.has(role)) {
        throw new BadRequestException('La EDT no contiene actividades para el perfil ' + role + '.');
      }
    }

    const modulesByName = new Map<string, {
      name: string;
      tasks: Array<{
        wbs: string; name: string; description: string; role: string; hours: number;
        stageCode: string; submodule: string; referenceIds: string[];
        classification: string; roleEffort: Array<{ role: string; hours: number }>;
      }>;
      totalHours: number;
    }>();
    for (const row of raw.activities) {
      const effort = effortByWbs.get(row.wbs);
      if (!effort?.length) {
        throw new BadRequestException('La actividad ' + row.wbs + ' no tiene HH por perfil.');
      }
      const key = row.module.toLocaleLowerCase('es');
      const module = modulesByName.get(key) ??
        { name: row.module, tasks: [], totalHours: 0 };
      const activityHours = roundHours(effort.reduce((sum, part) => sum + part.hours, 0));
      const primary = [...effort].sort((a, b) => b.hours - a.hours)[0]!;
      module.tasks.push({
        wbs: row.wbs, name: row.name, description: row.description,
        role: primary.role, hours: activityHours, stageCode: row.stageCode,
        submodule: row.submodule,
        referenceIds: [...new Set(row.references.split(/[;,]/)
          .map((ref) => ref.trim()).filter(Boolean))],
        classification: row.classification, roleEffort: effort,
      });
      module.totalHours = roundHours(module.totalHours + activityHours);
      modulesByName.set(key, module);
      const stage = stages.get(row.stageCode)!;
      stage.totalHours = roundHours(stage.totalHours + activityHours);
    }
    if (modulesByName.size > 20 ||
        [...modulesByName.values()].some((module) => module.tasks.length > 80)) {
      throw new BadRequestException(
        'La EDT excede el máximo de 20 módulos o 80 actividades por módulo.');
    }
    if ([...stages.values()].some((stage) => stage.totalHours <= 0)) {
      throw new BadRequestException(
        'Todos los tramos declarados deben tener actividades con HH positivas.');
    }
    validateStageCapacity(raw, proposal.roles);
    const modules = [...modulesByName.values()];
    const totalHours = roundHours(modules.reduce((sum, module) => sum + module.totalHours, 0));
    const reservePercent = raw.reservePercent;
    const reserveHours = roundHours(totalHours * reservePercent / 100);
    return quotationReferenceEdtSchema.parse({
      schemaVersion: 'kora.quotation.reference-edt.v2',
      source, provider: 'gemini',
      modules, totalHours,
      stages: [...stages.values()].sort((a, b) =>
        a.startWeek - b.startWeek || a.code.localeCompare(b.code)),
      reservePercent, reserveHours,
      totalWithReserve: roundHours(totalHours + reserveHours),
    });
  }

  /**
   * Las condiciones preliminares se validan ANTES de pedir la EDT.
   * En especial, un rol duplicado puede llegar del primer Gemini y hará
   * imposible reconciliar el segundo, por mucho que se regeneren actividades.
   */
  private validatePreliminaryRoles(
    roles: readonly EstimationPocProposal['roles'][number][],
  ): void {
    if (roles.length === 0 || roles.length > 12) {
      throw new BadRequestException(
        'Gemini propuso una cantidad inválida de perfiles (máximo 12).',
      );
    }
    const seen = new Set<string>();
    for (const role of roles) {
      const key = role.role.trim().toLocaleLowerCase('es');
      if (seen.has(key)) {
        throw new BadRequestException(
          'Gemini propuso el perfil duplicado «' + role.role +
          '». La EDT no se solicitará para ahorrar cuota.',
        );
      }
      seen.add(key);
      if (!Number.isInteger(role.people) || role.people < 1 || role.people > 100 ||
          !Number.isFinite(role.duration) || role.duration <= 0 ||
          !Number.isFinite(role.hoursPerUnit) || role.hoursPerUnit <= 0 ||
          !Number.isFinite(role.totalHours) || role.totalHours <= 0) {
        throw new BadRequestException(
          'El perfil «' + role.role +
          '» tiene personas, duración o HH preliminares inválidas. ' +
          'Se detuvo la generación antes de solicitar la EDT.',
        );
      }
    }
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
    const edtWeeks = Math.max(1, ...(edt.stages ?? []).map((stage) =>
      stage.startWeek + stage.durationWeeks - 1));
    const roles = preliminary.roles.map((role) => {
      const totalHours = byRole.get(role.role)!;
      // El calendario real de la EDT reemplaza el horizonte tentativo del
      // Líder Técnico; así el compromiso semanal se ve en el perfil agregado.
      const duration = isTechLeadRole(role.role) ? edtWeeks : role.duration;
      const unit = isTechLeadRole(role.role) ? 'week' as const : role.unit;
      const units = duration * role.people;
      if (units <= 0) throw new BadRequestException('La capacidad preliminar incluye perfiles sin duración.');
      return {
        ...role, unit, duration, totalHours,
        // En el TL, >5 puede reflejar arquitectura hands-on adicional.
        // La base fija vive separada en el WBS TL-GOV.01.
        hoursPerUnit: Math.round(totalHours / units * 10000) / 10000,
      };
    });
    return estimationPocProposalSchema.parse({
      ...preliminary, roles, totalHours: edt.totalHours,
    });
  }

  async execute(
    input: EstimationInputWithQuestions,
    activeKoraTeams?: readonly KoraActiveTeam[],
    authorizedSources?: DocumentSourceReader,
  ): Promise<EstimationPocProposal> {
    if (activeKoraTeams && activeKoraTeams.length === 0) {
      throw new BadRequestException('Kora no tiene equipos activos disponibles para estimar.');
    }
    const loaded = this.ai.name === 'poc-ai'
      ? { documents: [], coverage: null }
      : await readEstimationDocuments(authorizedSources ?? this.sources, input.driveFolderUrl);
    const documents = loaded.documents;
    const coverageNote = describeDocumentCoverage(loaded.coverage);

    if (this.ai.name !== 'poc-ai' && documents.length === 0) {
      throw new Error(
        'La carpeta no contiene documentos compatibles para la PoC. ' +
        (coverageNote ?? 'Usa PDF, Google Docs, Sheets, Slides o archivos de texto/CSV.'),
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
          ...(activeKoraTeams ? { activeKoraTeams } : {}),
          answers: input.answers,
        resolvedAnswers: resolveEstimationQuestionnaireContext(input),
          confirmedUnderstanding: 'confirmedUnderstanding' in input ? input.confirmedUnderstanding : null,
          sourceDocuments: documents.map((document) => ({
            sourceId: document.sourceId,
            name: document.name,
            path: document.path,
            mimeType: document.mimeType,
          })),
          sourceCoverage: coverageNote,
        },
        instructions: [
          BASE_INSTRUCTIONS,
          'Si context.sourceCoverage advierte omisiones, no inventes los requisitos faltantes ni afirmes cobertura documental total.',
          ...(activeKoraTeams ? [
            'Los únicos equipos permitidos son los de context.activeKoraTeams, leídos del catálogo real de Kora.',
            'Cada perfil profesional debe indicar teamId, que debe coincidir EXACTAMENTE con un ID del catálogo.',
            'Puedes proponer varios perfiles profesionales para el mismo equipo, sin crear equipos nuevos.',
            'No conviertas cargos (Tech Lead, Backend, Project Manager, QA Engineer) en nombres de equipos.',
            'Si ningún equipo activo es apropiado para un perfil necesario, no inventes un ID; explica la limitación.',
          ] : []),
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
        responseJsonSchema: activeKoraTeams ? {
          ...TEAM_ESTIMATE_RESPONSE_SCHEMA,
          properties: {
            ...TEAM_ESTIMATE_RESPONSE_SCHEMA.properties,
            roles: {
              ...TEAM_ESTIMATE_RESPONSE_SCHEMA.properties.roles,
              items: {
                ...TEAM_ESTIMATE_RESPONSE_SCHEMA.properties.roles.items,
                properties: {
                  ...TEAM_ESTIMATE_RESPONSE_SCHEMA.properties.roles.items.properties,
                  teamId: { type: 'STRING', description: 'UUID exacto de context.activeKoraTeams' },
                },
                required: [...TEAM_ESTIMATE_RESPONSE_SCHEMA.properties.roles.items.required, 'teamId'],
              },
            },
          },
        } : TEAM_ESTIMATE_RESPONSE_SCHEMA,
      }),
    );
    if (activeKoraTeams) {
      const allowed = new Set(activeKoraTeams.map((team) => team.teamId));
      const invalid = draft.roles.find((role) => !role.teamId || !allowed.has(role.teamId));
      if (invalid) {
        throw new BadRequestException('Gemini propuso un perfil sin equipo activo válido de Kora: ' + invalid.role);
      }
    }

    // El modelo propone roles; el backend materializa la gobernanza obligatoria.
    // En datos PoC de demostración preservamos el fixture heredado.
    const preliminaryRoles = [...draft.roles];
    const isRealGemini = this.ai.name === 'gemini' &&
      extractDriveFolderId(input.driveFolderUrl) !== 'kora-poc-fallback';
    if (isRealGemini) {
      // El propio TL no fija el horizonte: evita que una duración sugerida
      // excesiva por Gemini infle circularmente sus horas de supervisión.
      const horizonWeeks = estimatedWeeksFromRoles(preliminaryRoles.filter((role) =>
        !isTechLeadRole(role.role)));
      const leadIndices = preliminaryRoles
        .map((role, index) => isTechLeadRole(role.role) ? index : -1)
        .filter((index) => index >= 0);
      if (leadIndices.length > 1) {
        throw new BadRequestException(
          'Gemini propuso más de un Líder Técnico. Debe existir un único perfil de supervisión.',
        );
      }
      const governanceSource = 'Política ' + ESTIMATION_METHODOLOGY_VERSION +
        ': supervisión y control técnico ' + TECH_LEAD_HOURS_PER_WEEK +
        ' HH por semana; arquitectura hands-on adicional se estima en la EDT.';
      if (leadIndices.length === 0) {
        const compatibleTeam = activeKoraTeams?.find((team) =>
          isCompatibleTechLeadTeam(team.name));
        if (activeKoraTeams && !compatibleTeam) {
          throw new BadRequestException(
            'No existe equipo activo compatible con Líder Técnico. ' +
            'Asigna explícitamente un equipo de desarrollo/arquitectura ' +
            'antes de cotizar; no se inventará un teamId.',
          );
        }
        preliminaryRoles.push({
          role: 'Líder Técnico',
          unit: 'week',
          duration: horizonWeeks,
          hoursPerUnit: TECH_LEAD_HOURS_PER_WEEK,
          people: 1,
          source: governanceSource,
          ...(compatibleTeam ? { teamId: compatibleTeam.teamId } : {}),
        });
      } else {
        const index = leadIndices[0]!;
        preliminaryRoles[index] = {
          ...preliminaryRoles[index]!,
          unit: 'week',
          duration: horizonWeeks,
          hoursPerUnit: TECH_LEAD_HOURS_PER_WEEK,
          people: 1,
          source: governanceSource,
        };
      }
    }
    // El esquema inicial permite 0 para compatibilidad con la PoC, pero
    // una EDT real exige duración, dedicación y colaboradores positivos.
    // Rechazar aquí evita consumir la segunda llamada Gemini innecesariamente.
    const preview = preliminaryRoles.map((role) => ({
      ...role,
      totalHours: roundHours(role.duration * role.hoursPerUnit * role.people),
    }));
    this.validatePreliminaryRoles(preview);
    const roles = preview;
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
      summary: coverageNote
        ? (draft.summary.slice(0, Math.max(0, 2998 - coverageNote.length)) +
          '\n\n' + coverageNote).slice(0, 3000)
        : draft.summary,
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
