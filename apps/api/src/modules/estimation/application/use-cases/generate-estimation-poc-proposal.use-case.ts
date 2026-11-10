import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { fitGeneratedLabel, normalizeGeneratedProposal } from '../ai-generated-text';
import { optimizeWorkforceForEdt, replanEdtStagesToFullTime } from '../estimation-workforce-optimizer';
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
/** Referencias del modelo: conservar la evidencia textual completa.
 * Las comas forman parte de títulos, capítulos o celdas, no son separadores.
 * Si hay más de 30 identificadores, agrupar el resto en el último elemento
 * (sin eliminar ninguno ni inventar contenido). */
function normalizeEdtReferences(raw: string): string[] {
  const refs = [...new Set(raw.split(';').map((part) => part.trim()).filter(Boolean))];
  return refs.length <= 30
    ? refs
    : [...refs.slice(0, 29), refs.slice(29).join(';')];
}

const detailResponseSchema = z.object({
  reservePercent: z.number().min(0).max(100),
  stages: z.array(z.object({
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).transform((v) => fitGeneratedLabel(v, 300)),
    startWeek: z.number().int().min(1).max(520),
    durationWeeks: z.number().int().min(1).max(520),
  })).min(1).max(20),
  activities: z.array(z.object({
    wbs: z.string().trim().min(1).max(40),
    stageCode: z.string().trim().min(1).max(40),
    module: z.string().trim().min(1).transform((v) => fitGeneratedLabel(v, 300)),
    submodule: z.string().trim().transform((v) => fitGeneratedLabel(v, 300)),
    name: z.string().trim().min(1).transform((v) => fitGeneratedLabel(v, 300)),
    // Narrativas y referencias completas: la respuesta del proveedor ya está
    // acotada por su límite global de salida. No truncar evidencia.
    description: z.string().trim(),
    references: z.string().trim(),
    // classification es una etiqueta auxiliar. No se debe invalidar TODA la
    // EDT (ni las HH) si el modelo devuelve un nombre descriptivo largo.
    // Normalizamos solo la etiqueta, sin alterar tareas, evidencias ni esfuerzo.
    classification: z.string().trim().transform((label) =>
      label.length <= 40 ? label : label.slice(0, 39).trimEnd() + '…'),
  })).min(1).max(120),
  roleHours: z.array(z.object({
    wbs: z.string().trim().min(1).max(40),
    role: z.string().trim().min(1).max(120),
    hours: z.number().positive().max(1000000),
    // Los campos son opcionales al parsear para generar un mensaje claro de
    // validación; todas las EDT nuevas deben traer ambos por perfil.
    taskName: z.string().trim().min(1)
      .transform((v) => fitGeneratedLabel(v, 300)).optional(),
    taskDescription: z.string().trim().min(1).optional(),
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
          references: { type: 'STRING',
            description: 'Códigos de fuente verificables: archivo y página/hoja/celda. Separar con punto y coma; no copiar párrafos. Las referencias extensas se conservarán íntegras.' },
          classification: { type: 'STRING',
            description: 'Etiqueta de clasificación CORTA, máximo 40 caracteres; nunca un párrafo. Si no aplica, cadena vacía.' },
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
          taskName: { type: 'STRING',
            description: 'Tarea concreta ejecutada SOLO por este perfil dentro del WBS compartido.' },
          taskDescription: { type: 'STRING',
            description: 'Acciones y entregable verificable propios del perfil. NO repetir tareas de otros perfiles.' },
        },
        required: ['wbs', 'role', 'hours', 'taskName', 'taskDescription'],
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
    onThoughtSummary?: (text: string) => void,
    onActivity?: (step: string, text: string) => void,
  ): Promise<QuotationReferenceEdt> {
    const isDemo = extractDriveFolderId(input.driveFolderUrl) === 'kora-poc-fallback';
    if (!['gemini', 'openai'].includes(this.ai.name) ||
        proposal.provider !== this.ai.name ||
        proposal.projectId !== input.projectId ||
        proposal.sourceMode !== (isDemo ? 'poc_simulated' : 'drive')) {
      throw new BadRequestException('La EDT no corresponde al análisis IA de la carpeta seleccionada.');
    }
    this.validatePreliminaryRoles(proposal.roles);
    onActivity?.('edt_reading', 'Leyendo las fuentes documentales para elaborar la EDT.');
    const loaded = await readEstimationDocuments(
      authorizedSources ?? this.sources, input.driveFolderUrl,
    );
    const docs = loaded.documents;
    onActivity?.('edt_documents', 'Documentos preparados para EDT: ' + docs.length + '.');
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
        provider: this.ai.name,
        source: isDemo ? 'kdm_demo' : 'drive',
        userInstructions: input.instructions,
        preliminaryAssumptions: proposal.assumptions,
        unresolvedPreliminaryQuestions: proposal.clarifyingQuestions,
        answers: input.answers,
        resolvedAnswers: resolveEstimationQuestionnaireContext(input),
        confirmedUnderstanding: 'confirmedUnderstanding' in input ? input.confirmedUnderstanding : null,
        // La propuesta previa solo fija el catálogo de perfiles/equipos.
        // Sus personas/duraciones NO son presupuesto ni restricciones para
        // Gemini: se dimensionan de forma determinística desde las HH finales.
        allowedRoles: proposal.roles.map((role) => ({
          role: role.role, teamId: role.teamId ?? null,
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
        'activities.name y activities.description describen el objetivo COMPARTIDO, no instrucciones de un rol particular.',
        'Cada fila roleHours debe tener taskName y taskDescription NO VACÍOS y propios del perfil: qué acciones realizará exactamente y qué entregable verificable producirá.',
        'La participación de varios roles NO significa ejecutar la misma labor: UX/UI diseña flujos, pantallas y prototipos Figma; Desarrollo implementa e integra interfaces/API; QA prueba criterios y reporta defectos. Ajusta estos ejemplos al alcance real.',
        'Para un WBS compartido, NO repitas taskName ni taskDescription entre perfiles distintos; las responsabilidades y entregables deben ser complementarios sin sumar dos veces las mismas HH.',
        'No dupliques activities bajo WBS diferentes con el mismo nombre, descripción, etapa y módulo; si el objetivo es el mismo, consérvalo como una actividad con subtareas y HH diferenciadas por rol.',
        'Los nombres de stages deben distinguir los tramos cuando son diferentes; no declares dos etapas equivalentes con el mismo nombre e intervalo.',
        'Estima las horas por actividad y perfil en roleHours según su complejidad y alcance. No hagas que sumen un total predeterminado.',
         'Para ventanas temporales considera dedicación completa de 40 HH por semana por persona; si hay más colaboradores, reduce la duración de las fases cuando el trabajo permita paralelismo. Nunca reduzcas HH de actividades para simular mayor dotación.',
        'No copies ni infieras un presupuesto de la dotación, horas por unidad o duración preliminar. Kora dimensionará el personal después de verificar la EDT.',
        'Solo utiliza role que coincida EXACTAMENTE con allowedRoles. Cada perfil declarado debe intervenir en al menos una actividad real.',
        'No inventes funciones fuera del alcance: separa explícitamente exclusiones y supuestos en la descripción.',
        'Respeta las opciones seleccionadas y los supuestos de context.resolvedAnswers al definir actividades/HH; no confundas supuesto pendiente con decisión confirmada.',
        'Respeta context.userInstructions y distingue context.preliminaryAssumptions de decisiones confirmadas. Las preguntas preliminares sin resolver son incertidumbres, nunca autorizaciones para ampliar el alcance.',
        'Agrupa actividades en módulos funcionales (module), submódulos (submodule) y tramos cronológicos (stageCode, stageName). Un tramo puede abarcar varios módulos y perfiles.',
        'Cada stageCode de activities debe existir exactamente una vez en stages. Los periodos se definen SOLO en stages, nunca por actividad.',
        'No declares stages sin actividades reales: cada tramo debe estar referenciado por al menos un WBS con HH positivas en roleHours. Los hitos sin trabajo propio se describen como entregables, no como tramos vacíos.',
        'startWeek y durationWeeks son rangos SEMANALES RELATIVOS y estimativos, nunca fechas del proyecto; los tramos pueden solaparse con trabajo paralelo.',
        'WBS es único dentro de activities; repetirlo en activities, incluso con datos idénticos, es un error.',
        'Cada roleHours debe referir a un WBS existente, su role debe coincidir EXACTAMENTE con allowedRoles y ninguna pareja WBS×role debe duplicarse.',
        'references: SOLO referencias verificables, como código de requisito, archivo + página o archivo + HOJA + celda (ejemplo Reglas.xlsx · Matriz!B14). Separa con punto y coma (;). Mantén las citas concisas y no copies párrafos ni inventes fuentes. Kora conserva las referencias extensas sin recortarlas.',
        'Para documentos Excel convertidos a texto identifica la HOJA y las coordenadas de celda que sustentan cada actividad (ejemplo: Reglas.xlsx · HOJA Validaciones · B14). Revisa todas las hojas visibles entregadas; no interpretes fórmulas sin valor calculado como resultados ni inventes filas omitidas.',
        'classification: SOLO una etiqueta de categoría corta (máximo 40 caracteres), nunca una explicación. Si no aplica, cadena vacía. La explicación detallada pertenece a description.',
        'roleHours.hours siempre mayor a 0 y con hasta dos decimales. Cada actividad debe tener al menos un perfil. No inventes personas, responsables nominales ni estados de ejecución.',
        'reservePercent: solo usa el porcentaje expresamente pedido en el documento o cuestionario; si no aparece, devuelve 0. La reserva no integra las HH base.',
        'Máximo 20 módulos, 120 actividades WBS únicas, 20 tramos y 240 filas roleHours.',
        'Controla el tamaño de salida: para un proyecto de complejidad media busca unas 20 a 45 actividades WBS concretas; no fragmentes tareas triviales. Prioriza cubrir todo el alcance documentado sin exceder los límites de respuesta del proveedor IA.',
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


    // Los artefactos generativos se validan en servidor (integridad WBS/HH).
    // Reintentar consume tokens/créditos; el segundo intento es opt-in.
    // Mantener el nombre antiguo por compatibilidad con instalaciones Gemini.
    const maxAttempts = (process.env.KORA_EDT_MAX_ATTEMPTS ??
      process.env.KORA_GEMINI_EDT_MAX_ATTEMPTS) === '2' ? 2 : 1;
    const providerLabel = this.ai.name === 'openai' ? 'OpenAI' : 'Gemini';
    let validationIssue = '';
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      onActivity?.('edt_model_request', attempt === 0
        ? 'Solicitud de EDT enviada al agente IA; esperando la respuesta estructurada.'
        : 'Reintentando la EDT tras una validación fallida (reintento configurado).');
      const output = await this.ai.generateStructured({
        ...request,
        instructions: attempt === 0 ? request.instructions : [
          request.instructions,
          'La EDT anterior fue rechazada por las validaciones del servidor.',
          'Rehaz la EDT desde la fuente original. Corrige exactamente este problema:',
          validationIssue,
          'Corrige las tres tablas: stages sin códigos repetidos; activities con un WBS único',
          'por actividad; roleHours con una sola pareja WBS×perfil, HH > 0,',
        'taskName y taskDescription específicos del perfil y dos decimales.',
          'Toda actividad debe referir a un tramo válido y tener HH de al menos un perfil.',
          'No transformes las HH para igualar una cifra preliminar.',
        ].join('\n'),
      }, onThoughtSummary);
      onActivity?.('edt_model_response', 'EDT recibida; validando tareas, WBS, perfiles y HH.');
      try {
        const verified = this.buildVerifiedEdt(output, proposal, isDemo ? 'kdm_demo' : 'drive');
        onActivity?.('edt_verified', 'EDT validada: ' + verified.modules.length +
          ' módulos y ' + verified.totalHours + ' HH.');
        return verified;
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
              ? providerLabel + ' devolvió una EDT inconsistente (sin reintento automático): '
              : providerLabel + ' devolvió una EDT inconsistente tras el reintento: ') +
            validationIssue.slice(0, 250),
          );
        }
      }
    }
    throw new BadRequestException(providerLabel + ' no devolvió una EDT válida.');
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
    // Replanificar con 40 HH por persona antes de calcular la supervisión TL.
    // No altera HH por actividad ni consume una llamada adicional a Gemini.
    const planned = source === 'drive'
      ? { ...parsed, stages: replanEdtStagesToFullTime(
          parsed.stages,
          parsed.roleHours.map((item) => ({
            stageCode: parsed.activities.find((activity) =>
              activity.wbs === item.wbs)?.stageCode ?? '',
            role: item.role, hours: item.hours,
          })),
          proposal.roles,
        ) }
      : parsed;
    const raw = source === 'drive'
      ? addMandatoryTechLeadSupervision(planned, leadRoles[0]!.role)
      : planned;
    const validRoles = new Set(proposal.roles.map((role) => role.role));

    type Stage = {
      code: string; name: string; startWeek: number;
      durationWeeks: number; totalHours: number;
    };
    const stages = new Map<string, Stage>();
    const normalizeText = (value: string) => value.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
      .replace(/[^a-z0-9]+/g, ' ').trim();
    const uniqueStageWindows = new Set<string>();
    for (const row of raw.stages) {
      const sameWindow = JSON.stringify([
        normalizeText(row.name), row.startWeek, row.durationWeeks,
      ]);
      if (uniqueStageWindows.has(sameWindow)) {
        throw new BadRequestException(
          'Dos fases tienen el mismo nombre y las mismas semanas: ' + row.name +
          '. Agrupa el trabajo en una etapa o diferencia claramente los tramos.');
      }
      uniqueStageWindows.add(sameWindow);
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
    const uniqueActivities = new Set<string>();
    for (const row of raw.activities) {
      const signature = JSON.stringify([
        row.stageCode, normalizeText(row.module),
        normalizeText(row.name), normalizeText(row.description),
      ]);
      if (uniqueActivities.has(signature)) {
        throw new BadRequestException(
          'La actividad ' + row.wbs +
          ' duplica el mismo título y descripción en su fase y módulo. ' +
          'Consolida el trabajo compartido y diferencia tareas por perfil.');
      }
      uniqueActivities.add(signature);
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

    const effortByWbs = new Map<string, Array<{
      role: string; hours: number; taskName?: string; taskDescription?: string;
    }>>();
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
      effort.push({
        role: item.role, hours: item.hours,
        ...(item.taskName ? { taskName: item.taskName } : {}),
        ...(item.taskDescription ? { taskDescription: item.taskDescription } : {}),
      });
      effortByWbs.set(item.wbs, effort);
      usedRoles.add(item.role);
    }
    for (const role of validRoles) {
      if (!usedRoles.has(role)) {
        throw new BadRequestException('La EDT no contiene actividades para el perfil ' + role + '.');
      }
    }
    // Las comprobaciones estructurales anteriores siguen teniendo prioridad;
    // después validar la calidad semántica de los entregables por perfil.
    for (const [wbs, effort] of effortByWbs) {
      const titles = new Set<string>();
      const details = new Set<string>();
      for (const item of effort) {
        if (!item.taskName?.trim() || !item.taskDescription?.trim()) {
          throw new BadRequestException(
            'La asignación ' + wbs + ' / ' + item.role +
            ' necesita taskName y taskDescription específicos del perfil.');
        }
        const title = normalizeText(item.taskName);
        const detail = normalizeText(item.taskDescription);
        if (effort.length > 1 && (titles.has(title) || details.has(detail))) {
          throw new BadRequestException(
            'El WBS ' + wbs + ' repite la misma tarea o descripción para perfiles ' +
            'distintos. Cada perfil necesita responsabilidades y entregables diferenciados.');
        }
        titles.add(title);
        details.add(detail);
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
        // Separar solo por punto y coma; títulos y secciones pueden contener
        // comas. El campo original limita la longitud total a 1.000 caracteres.
        referenceIds: normalizeEdtReferences(row.references),
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
    // Gemini puede declarar un tramo cronológico sin asignarle ningún WBS.
    // Omitir solo esos tramos vacíos: ninguna actividad, perfil ni HH se elimina.
    // Las validaciones anteriores siguen rechazando referencias, HH y WBS inválidos.
    const activeStages = [...stages.values()].filter((stage) => stage.totalHours > 0);
    const activeStageCodes = new Set(activeStages.map((stage) => stage.code));
    const rawActiveStages = raw.stages.filter((stage) => activeStageCodes.has(stage.code));
    // Dimensionar con las HH definitivas de la EDT, no con el headcount
    // tentativo del primer Gemini. Las fases simultáneas comparten capacidad;
    // su pico por semana determina cuántas personas necesitan el rol.
    const optimized = optimizeWorkforceForEdt(
      rawActiveStages,
      raw.roleHours.map((part) => ({
        stageCode: activities.get(part.wbs)!.stageCode,
        role: part.role, hours: part.hours,
      })),
      proposal.roles,
    );
    validateStageCapacity({ ...raw, stages: rawActiveStages }, optimized.roles.map((role) => ({
      role: role.role, people: role.people,
    })));
    const modules = [...modulesByName.values()];
    const totalHours = roundHours(modules.reduce((sum, module) => sum + module.totalHours, 0));
    const reservePercent = raw.reservePercent;
    const reserveHours = roundHours(totalHours * reservePercent / 100);
    return quotationReferenceEdtSchema.parse({
      schemaVersion: 'kora.quotation.reference-edt.v2',
      source, provider: this.ai.name,
      modules, totalHours,
      stages: activeStages.sort((a, b) =>
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
        'El proveedor IA propuso una cantidad inválida de perfiles (máximo 12).',
      );
    }
    const seen = new Set<string>();
    for (const role of roles) {
      const key = role.role.trim().toLocaleLowerCase('es');
      if (seen.has(key)) {
        throw new BadRequestException(
          'El proveedor IA propuso el perfil duplicado «' + role.role +
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
    const workforce = optimizeWorkforceForEdt(
      edt.stages ?? [],
      edt.modules.flatMap((module) => module.tasks.flatMap((task) =>
        (task.roleEffort ?? [{ role: task.role, hours: task.hours }])
          .map((effort) => ({
            stageCode: task.stageCode ?? '',
            role: effort.role, hours: effort.hours,
          })))),
      preliminary.roles,
    );
    const bySizedRole = new Map(workforce.roles.map((role) => [role.role, role]));
    const roles = preliminary.roles.map((role) => {
      const totalHours = byRole.get(role.role)!;
      const staffing = bySizedRole.get(role.role)!;
      // El calendario es el de la EDT; cada rol se dimensiona según sus
      // SEMANAS ACTIVAS y su pico, no según los números iniciales de Gemini.
      // TL preserva exactamente una persona y el horizonte de supervisión.
      const lead = isTechLeadRole(role.role);
      const duration = lead ? edtWeeks : staffing.activeWeeks;
      const people = lead ? 1 : staffing.people;
      const units = duration * people;
      if (units <= 0) throw new BadRequestException('La EDT contiene perfiles sin capacidad.');
      return {
        ...role, unit: 'week' as const, duration, people, totalHours,
        // Horas medias REALES, nunca se inflan a 40 por rellenar capacidad.
        // La dotación peak puede estar activa solo parte del cronograma.
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
    onThoughtSummary?: (text: string) => void,
    onActivity?: (step: string, text: string) => void,
  ): Promise<EstimationPocProposal> {
    if (activeKoraTeams && activeKoraTeams.length === 0) {
      throw new BadRequestException('Kora no tiene equipos activos disponibles para estimar.');
    }
    onActivity?.('proposal_reading', 'Leyendo las fuentes documentales para proponer perfiles.');
    const loaded = this.ai.name === 'poc-ai'
      ? { documents: [], coverage: null }
      : await readEstimationDocuments(authorizedSources ?? this.sources, input.driveFolderUrl);
    const documents = loaded.documents;
    onActivity?.('proposal_documents', 'Documentos preparados para perfiles: ' + documents.length + '.');
    const coverageNote = describeDocumentCoverage(loaded.coverage);

    if (this.ai.name !== 'poc-ai' && documents.length === 0) {
      throw new Error(
        'La carpeta no contiene documentos compatibles para la PoC. ' +
        (coverageNote ?? 'Usa PDF, Excel .xlsx, Google Docs, Sheets, Slides o archivos de texto/CSV.'),
      );
    }

    onActivity?.('proposal_model_request', 'Solicitando perfiles y capacidades al agente IA.');
    const draft = estimationPocAiDraftSchema.parse(
      normalizeGeneratedProposal(await this.ai.generateStructured({
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
          'clarifyingQuestions es una lista residual de CERO a CINCO preguntas, en orden de impacto. No repitas ninguna que ya tenga respuesta confirmada en context.resolvedAnswers; si no hay pendientes devuelve []. Exceder cinco preguntas invalida la propuesta.',
          'El nivel de entrega confirmado en context.resolvedAnswers (F01: PoC, MVP, fase, solución completa o evolutivo) manda sobre el lenguaje ambiguo de los documentos: nunca llames PoC a un MVP o a una solución completa. Conserva la denominación PoC únicamente para referencias explícitas a trabajos previos en documentos.',
          'Los Excel .xlsx se entregan como texto por HOJA y FILA con coordenadas de celda. Considera sus reglas, matrices y alcance igual que los PDF y documentos; no uses fórmulas sin resultado calculado como valores confirmados.',
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
      }, onThoughtSummary)),
    );
    onActivity?.('proposal_response', 'Propuesta recibida; validando perfiles y equipos autorizados.');
    if (activeKoraTeams) {
      const allowed = new Set(activeKoraTeams.map((team) => team.teamId));
      const invalid = draft.roles.find((role) => !role.teamId || !allowed.has(role.teamId));
      if (invalid) {
        throw new BadRequestException('El proveedor IA propuso un perfil sin equipo activo válido de Kora: ' + invalid.role);
      }
    }

    // El modelo propone roles; el backend materializa la gobernanza obligatoria.
    // En datos PoC de demostración preservamos el fixture heredado.
    const preliminaryRoles = [...draft.roles];
    const isRealAi = (this.ai.name === 'gemini' || this.ai.name === 'openai') &&
      extractDriveFolderId(input.driveFolderUrl) !== 'kora-poc-fallback';
    if (isRealAi) {
      // El propio TL no fija el horizonte: evita que una duración sugerida
      // excesiva por Gemini infle circularmente sus horas de supervisión.
      const horizonWeeks = estimatedWeeksFromRoles(preliminaryRoles.filter((role) =>
        !isTechLeadRole(role.role)));
      const leadIndices = preliminaryRoles
        .map((role, index) => isTechLeadRole(role.role) ? index : -1)
        .filter((index) => index >= 0);
      if (leadIndices.length > 1) {
        throw new BadRequestException(
          'El proveedor IA propuso más de un Líder Técnico. Debe existir un único perfil de supervisión.',
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

    const result = estimationPocProposalSchema.parse({
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
    onActivity?.('proposal_verified', 'Propuesta verificada: ' + result.roles.length + ' perfiles.');
    return result;
  }
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}
