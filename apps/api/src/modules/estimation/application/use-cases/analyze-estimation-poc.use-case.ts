import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import {
  estimationPocAnalysisSchema,
  type AnalyzeEstimationPocInput,
  type EstimationPocAnalysis,
} from '@kora/contracts';
import { AI_PROVIDER, type AiProvider } from '../../../ai/application/ports/ai-provider.port';
import {
  DOCUMENT_SOURCE_READER, type DocumentSourceReader,
} from '../ports/document-source-reader.port';
import { extractDriveFolderId } from '../drive-source-selection';

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

  async execute(input: AnalyzeEstimationPocInput): Promise<EstimationPocAnalysis> {
    const isLegacyPoc = this.ai.name === 'poc-ai';
    const documents = isLegacyPoc ? [] :
      await this.sources?.readDriveSources(input.driveFolderUrl);
    if (!isLegacyPoc && (!documents || documents.length === 0)) {
      throw new BadRequestException('No se encontraron documentos legibles para analizar.');
    }
    const selected = documents ?? [];
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
      },
      instructions: [
        'Analiza EXCLUSIVAMENTE los documentos adjuntos. No inventes archivos ni hallazgos.',
        'Propón como máximo 5 preguntas dinámicas SOLO cuando su respuesta pueda modificar alcance, HH o arquitectura.',
        'No repitas las preguntas fijas de nivel de entrega, plazo, equipo, postproducción y condiciones generales.',
        'Si el documento contiene respuestas claras a F01/F02/F04, agrega fixedPrefills con questionId, value y sourceId real. Si no hay evidencia, devuelve [].',
        'Los valores permitidos para F01 son poc, mvp, phase, complete, evolution; F02 es texto libre y F04 es una lista CSV de uat, stabilization, pilot, support o none.',
        'NO prellenes la selección de equipo F03 ni inventes respuestas para las condiciones fijas.',
        'Cada pregunta debe señalar un motivo técnico concreto y citar sourceId de uno de los documentos proporcionados.',
        'Las opciones deben ser específicas y mutuamente compatibles, o usa answerType=text.',
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
    });

    if (typeof raw !== 'object' || raw === null) {
      throw new BadRequestException('Gemini no entregó un análisis documental estructurado.');
    }
    const data = raw as Record<string, unknown>;
    const questions = Array.isArray(data.dynamicQuestions)
      ? data.dynamicQuestions.slice(0, 5) : [];
    const allowedSources = new Map(selected.map((doc) => [doc.sourceId, doc.name]));
    // Solo prellenar cuando Gemini cita realmente el documento proporcionado.
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
      const value = candidate.value?.trim();
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
        throw new BadRequestException('Gemini devolvió una pregunta inválida.');
      }
      const candidate = question as Record<string, unknown>;
      if (!isLegacyPoc) {
        const refs = Array.isArray(candidate.sourceRefs) ? candidate.sourceRefs : [];
        if (!refs.length || refs.some((ref) => {
          if (!ref || typeof ref !== 'object') return true;
          const id = (ref as { sourceId?: string }).sourceId;
          return !id || !allowedSources.has(id);
        })) {
          throw new BadRequestException('Gemini no justificó una aclaración con el documento proporcionado.');
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
      return {
        ...candidate,
        id: 'D' + String(index + 1).padStart(2, '0'),
        kind: 'dynamic',
        dependsOn: [],
      };
    });
    return estimationPocAnalysisSchema.parse({
      projectId: input.projectId,
      provider: this.ai.name,
      sourceMode: isLegacyPoc || extractDriveFolderId(input.driveFolderUrl) === 'kora-poc-fallback'
        ? 'poc_simulated' : 'drive',
      documentsAnalyzed: selected.length,
      summary: data.summary,
      detectedDocuments: selected.map((doc) => doc.name),
      fixedPrefills,
      dynamicQuestions: normalizedQuestions,
    });
  }
}
