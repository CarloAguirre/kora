import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import {
  estimationPocAnalysisSchema,
  type AnalyzeEstimationPocInput,
  type EstimationPocAnalysis,
} from '@kora/contracts';
import { AI_PROVIDER, type AiProvider } from '../../../ai/application/ports/ai-provider.port';
import {
  DOCUMENT_SOURCE_READER, type DocumentSourceReader,
  readEstimationDocuments, describeDocumentCoverage,
} from '../ports/document-source-reader.port';
import { extractDriveFolderId } from '../drive-source-selection';
import { ESTIMATION_ANALYSIS_GUIDANCE } from '../estimation-methodology';

const DYNAMIC_QUESTIONS_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    fixedPrefills: {
      type: 'ARRAY', maxItems: 3, items: {
        type: 'OBJECT', properties: {
          questionId: { type: 'STRING', enum: ['F01', 'F02', 'F04'] },
          value: { type: 'STRING' },
          sourceId: { type: 'STRING' },
          reason: { type: 'STRING' },
        }, required: ['questionId', 'value', 'sourceId', 'reason'],
      },
    },
    dynamicQuestions: {
      type: 'ARRAY', minItems: 0, maxItems: 5,
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          kind: { type: 'STRING', enum: ['dynamic'] },
          category: { type: 'STRING' },
          question: { type: 'STRING' },
          reason: { type: 'STRING' },
          impact: { type: 'STRING', enum: ['high', 'medium', 'low'] },
          answerType: { type: 'STRING', enum: ['single_choice', 'multi_choice', 'text', 'confirmation'] },
          options: { type: 'ARRAY', items: {
            type: 'OBJECT', properties: {
              value: { type: 'STRING' }, label: { type: 'STRING' },
            }, required: ['value', 'label'],
          } },
          required: { type: 'BOOLEAN' },
          confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
          priorityScore: { type: 'INTEGER' },
          assumptionIfSkipped: { type: 'STRING' },
          sourceRefs: { type: 'ARRAY', items: {
            type: 'OBJECT', properties: {
              sourceId: { type: 'STRING' }, fileName: { type: 'STRING' },
              excerpt: { type: 'STRING' },
            }, required: ['sourceId', 'fileName'],
          } },
        },
        required: ['id', 'kind', 'category', 'question', 'reason', 'impact',
          'answerType', 'options', 'required', 'confidence', 'priorityScore', 'sourceRefs'],
      },
    },
  },
  required: ['summary', 'dynamicQuestions'],
} as const;

@Injectable()
export class AnalyzeEstimationPocUseCase {
  constructor(
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    @Optional() @Inject(DOCUMENT_SOURCE_READER)
    private readonly sources?: DocumentSourceReader,
  ) {}

  async execute(
    input: AnalyzeEstimationPocInput, authorizedSources?: DocumentSourceReader,
    onThoughtSummary?: (text: string) => void,
    onProgress?: (phase: 'documents' | 'gemini', text: string) => void,
  ): Promise<EstimationPocAnalysis> {
    const isLegacyPoc = this.ai.name === 'poc-ai';
    const sourceReader = authorizedSources ?? this.sources;
    const loaded = isLegacyPoc || !sourceReader
      ? { documents: [], coverage: null }
      : await readEstimationDocuments(sourceReader, input.driveFolderUrl);
    const coverageNote = describeDocumentCoverage(loaded.coverage);
    if (!isLegacyPoc && loaded.documents.length === 0) {
      throw new BadRequestException('No se encontraron documentos legibles para analizar. ' +
        (coverageNote ?? 'Comprueba los formatos de Drive y sus permisos.'));
    }
    const selected = loaded.documents;
    onProgress?.('documents',
      'Documentación leída: ' + selected.length + ' archivo(s) disponibles para el análisis.');
    onProgress?.('gemini', 'Enviando los antecedentes al agente IA para elaborar el entendimiento.');
    const raw = await this.ai.generateStructured({
      task: 'estimation.poc.analysis',
      context: {
        projectId: input.projectId,
        projectName: input.projectName,
        clientName: input.clientName,
        demoSource: extractDriveFolderId(input.driveFolderUrl) === 'kora-poc-fallback'
          ? 'kdm_fixture' : null,
        sourceDocuments: selected.map((doc) => ({
          sourceId: doc.sourceId, name: doc.name, path: doc.path, mimeType: doc.mimeType,
        })),
        sourceCoverage: coverageNote,
      },
      instructions: [
        'Analiza EXCLUSIVAMENTE los documentos adjuntos. No inventes archivos ni hallazgos.',
        'Si un documento proviene de Excel, revisa todas las hojas visibles entregadas: las referencias HOJA, FILA y celda permiten identificar requisitos, reglas y matrices. Los valores de fórmulas sin resultado calculado NO son resultados válidos.',
        ESTIMATION_ANALYSIS_GUIDANCE,
        'Informa únicamente sobre las fuentes realmente entregadas a esta llamada; no afirmes haber revisado toda la carpeta Drive si solo se seleccionó una parte.',
        'Propón como máximo 5 preguntas dinámicas SOLO cuando su respuesta pueda modificar alcance, HH o arquitectura.',
        'No repitas las preguntas fijas de nivel de entrega, plazo, equipo, postproducción y condiciones generales.',
        'Si el documento contiene respuestas claras a F01/F02/F04, agrega fixedPrefills con questionId, value y sourceId real. Si no hay evidencia, devuelve [].',
        'Los valores permitidos para F01 son poc, mvp, phase, complete, evolution; F02 es texto libre y F04 es una lista CSV de uat, stabilization, pilot, support o none.',
        'NO prellenes la selección de equipo F03 ni inventes respuestas para las condiciones fijas.',
        'Cada pregunta debe señalar un motivo técnico concreto y citar sourceId de uno de los documentos proporcionados.',
        'FORMATO DE ACLARACIONES: prioriza preguntas rápidas y estructuradas cuando la decisión se pueda expresar con alternativas justificables por los documentos.',
        'Usa answerType=single_choice para escenarios excluyentes (idealmente 2 a 5 opciones concretas), multi_choice para capacidades que pueden coexistir y confirmation para una decisión inequívocamente binaria Sí/No (options=[]).',
        'Reserva answerType=text SOLO si realmente se necesita información abierta o una explicación que no pueda representarse fielmente con opciones; para text y confirmation entrega options=[].',
        'Cada opción debe tener value estable y corto, label claro y vinculado al alcance. No inventes alternativas, porcentajes, funcionalidades o decisiones que los documentos no sustenten. No fuerces listas artificiales.',
        'Si una pregunta de opciones no es exhaustiva y existen otras posibilidades reales, añade UNA opción {value:"other",label:"Otro (especificar)"} al final; el usuario podrá redactar esa alternativa. No incluyas Otro cuando los escenarios son exhaustivos, especialmente en decisiones Sí/No.',
        'Evita preguntas que mezclen varias decisiones independientes en una sola; prioriza las cinco aclaraciones de mayor impacto sobre alcance, HH o arquitectura.',
        'No exijas al usuario escribir párrafos cuando una selección o confirmación permita tomar la misma decisión de estimación.',
        'Para cada aclaración, propone assumptionIfSkipped: un supuesto prudente y específico si el usuario aún no puede responder. Nunca afirmes que ese supuesto ya fue validado.',
        'No estimes HH todavía ni redactes un EDT: solo resumen del entendimiento y aclaraciones.',
        input.instructions ?? '',
      ].filter(Boolean).join('\n'),
      documents: selected.map((doc) => ({
        name: doc.name, mimeType: doc.mimeType,
        ...(doc.text ? { text: doc.text } : {}),
        ...(doc.dataBase64 ? { dataBase64: doc.dataBase64 } : {}),
      })),
      ...(isLegacyPoc ? {} : { responseJsonSchema: DYNAMIC_QUESTIONS_JSON_SCHEMA }),
    }, onThoughtSummary);

    if (typeof raw !== 'object' || raw === null) {
      throw new BadRequestException('El proveedor IA no entregó un análisis documental estructurado.');
    }
    const data = raw as Record<string, unknown>;
    const questions = Array.isArray(data.dynamicQuestions)
      ? data.dynamicQuestions.slice(0, 5) : [];
    const allowedSources = new Map(selected.map((doc) => [doc.sourceId, doc.name]));
    // Solo prellenar cuando el proveedor cita realmente el documento proporcionado.
    // La detección no sustituye la confirmación humana de las cinco preguntas.
    const fixedPrefills: Array<{
      questionId: 'F01' | 'F02' | 'F04';
      value: string | string[];
      sourceRefs: Array<{ sourceId: string; fileName: string }>;
    }> = [];
    const seenFixed = new Set<string>();
    const prefillsRaw = Array.isArray(data.fixedPrefills) ? data.fixedPrefills : [];
    for (const item of prefillsRaw) {
      if (!item || typeof item !== 'object') continue;
      const candidate = item as {
        questionId?: string; value?: string; sourceId?: string;
      };
      const id = candidate.questionId;
      const value = typeof candidate.value === 'string' ? candidate.value.trim() : null;
      const sourceId = candidate.sourceId;
      if (!id || !value || !sourceId || !allowedSources.has(sourceId) ||
          seenFixed.has(id)) continue;
      let normalized: string | string[] | null = null;
      if (id === 'F01' &&
          ['poc', 'mvp', 'phase', 'complete', 'evolution'].includes(value)) {
        normalized = value;
      } else if (id === 'F02' && value.length <= 300) {
        normalized = value;
      } else if (id === 'F04') {
        const pieces = value.split(',').map((part) => part.trim()).filter(Boolean);
        const allowed = ['uat', 'stabilization', 'pilot', 'support', 'none'];
        if (pieces.length && pieces.every((part) => allowed.includes(part)) &&
            new Set(pieces).size === pieces.length &&
            (!pieces.includes('none') || pieces.length === 1)) normalized = pieces;
      }
      if (normalized === null || !['F01', 'F02', 'F04'].includes(id)) continue;
      seenFixed.add(id);
      fixedPrefills.push({
        questionId: id as 'F01' | 'F02' | 'F04', value: normalized,
        sourceRefs: [{ sourceId, fileName: allowedSources.get(sourceId)! }],
      });
    }

    const normalizedQuestions = questions.map((question, index) => {
      if (!question || typeof question !== 'object' || Array.isArray(question)) {
        throw new BadRequestException('El proveedor IA devolvió una pregunta inválida.');
      }
      const candidate = question as Record<string, unknown>;
      if (!isLegacyPoc) {
        const refs = Array.isArray(candidate.sourceRefs) ? candidate.sourceRefs : [];
        if (!refs.length || refs.some((ref) => {
          if (!ref || typeof ref !== 'object') return true;
          const id = (ref as { sourceId?: string }).sourceId;
          return !id || !allowedSources.has(id);
        })) {
          throw new BadRequestException('El proveedor IA no justificó una aclaración con el documento proporcionado.');
        }
        candidate.sourceRefs = refs.map((ref) => {
          const row = ref as { sourceId: string; excerpt?: string };
          return {
            sourceId: row.sourceId,
            fileName: allowedSources.get(row.sourceId),
            excerpt: row.excerpt?.slice(0, 1000) ?? null,
          };
        });
      }
      // El modelo puede devolver un tipo de selección sin alternativas válidas.
      // No mostramos controles vacíos ni fabricamos decisiones: texto libre es
      // el fallback seguro. "Otro" solo existe si el modelo lo propone como
      // alternativa no exhaustiva, con un identificador estable para la UI.
      const requestedType = candidate.answerType;
      const isChoice = requestedType === 'single_choice' ||
        requestedType === 'multi_choice';
      const seenOptions = new Set<string>();
      const validOptions = (isChoice && Array.isArray(candidate.options)
        ? candidate.options : [])
        .flatMap((option): Array<{ value: string; label: string }> => {
          if (!option || typeof option !== 'object') return [];
          const entry = option as { value?: unknown; label?: unknown };
          if (typeof entry.value !== 'string' || typeof entry.label !== 'string')
            return [];
          const rawValue = entry.value.trim();
          const rawLabel = entry.label.trim();
          if (!rawValue || !rawLabel || rawValue.length > 200 ||
              rawLabel.length > 300) return [];
          const other = rawValue.toLowerCase() === 'other' ||
            /^(otro|otra opción|other)(?:\s*\(|\s*[:\-]|$)/i.test(rawLabel);
          return [{ value: other ? 'other' : rawValue,
            label: other ? 'Otro (especificar)' : rawLabel }];
        })
        .filter((option) => {
          if (seenOptions.has(option.value)) return false;
          seenOptions.add(option.value);
          return true;
        })
        .slice(0, 10);
      const orderedOptions = [
        ...validOptions.filter((option) => option.value !== 'other'),
        ...validOptions.filter((option) => option.value === 'other'),
      ];
      const usableChoice = isChoice &&
        orderedOptions.filter((option) => option.value !== 'other').length >= 2;
      return {
        ...candidate,
        answerType: isChoice && !usableChoice ? 'text' : requestedType,
        options: usableChoice ? orderedOptions : [],
        id: 'D' + String(index + 1).padStart(2, '0'),
        kind: 'dynamic',
        // Cuando el proveedor no propone un escenario concreto, solo es posible
        // declarar el dato como pendiente; nunca inventar una decisión comercial.
        assumptionIfSkipped: typeof candidate.assumptionIfSkipped === 'string' &&
          candidate.assumptionIfSkipped.trim()
          ? candidate.assumptionIfSkipped.trim().slice(0, 1500)
          : 'Pendiente de confirmar con el cliente; puede cambiar el alcance y las HH.',
        dependsOn: [],
      };
    });
    return estimationPocAnalysisSchema.parse({
      projectId: input.projectId,
      provider: this.ai.name,
      sourceMode: isLegacyPoc || extractDriveFolderId(input.driveFolderUrl) === 'kora-poc-fallback'
        ? 'poc_simulated' : 'drive',
      documentsAnalyzed: selected.length,
      summary: coverageNote
        ? (String(data.summary).slice(0, Math.max(0, 2998 - coverageNote.length)) +
          '\n\n' + coverageNote).slice(0, 3000)
        : data.summary,
      detectedDocuments: selected.map((doc) => doc.name),
      fixedPrefills,
      dynamicQuestions: normalizedQuestions,
    });
  }
}
