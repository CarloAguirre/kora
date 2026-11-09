import { describe, expect, it } from 'vitest';
import type { AiProvider } from '../../../ai/application/ports/ai-provider.port';
import type { DocumentSourceReader } from '../ports/document-source-reader.port';
import { AnalyzeEstimationPocUseCase } from './analyze-estimation-poc.use-case';

describe('AnalyzeEstimationPocUseCase', () => {
  it('incluye celdas XLSX como evidencia del mismo análisis Gemini y conserva el nombre del archivo', async () => {
    let received = '';
    let filename = '';
    const ai: AiProvider = {
      name: 'gemini',
      generateStructured: async (request) => {
        received = request.documents?.[0]?.text ?? '';
        filename = request.documents?.[0]?.name ?? '';
        return { summary: 'La matriz requiere aprobación', dynamicQuestions: [] };
      },
    };
    const reader: DocumentSourceReader = {
      readDriveSources: async () => [{
        sourceId: 'matriz-1', name: 'Reglas.xlsx',
        mimeType: 'text/plain', path: 'Levantamiento/Reglas.xlsx',
        text: 'HOJA "Validaciones": Fila 2: A2="RN-14" | B2="Requiere aprobación"',
      }],
    };
    const result = await new AnalyzeEstimationPocUseCase(ai, reader).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'Portal', clientName: 'Cliente',
      driveFolderUrl: 'https://drive.google.com/drive/folders/folder-1',
      instructions: null,
    });
    expect(result.documentsAnalyzed).toBe(1);
    expect(filename).toBe('Reglas.xlsx');
    expect(received).toContain('RN-14');
    expect(result.detectedDocuments).toContain('Reglas.xlsx');
  });

  it('normaliza el análisis previo sin generar todavía HH', async () => {
    const ai: AiProvider = {
      name: 'poc-ai',
      generateStructured: async () => ({
        summary: 'Análisis preliminar',
        detectedDocuments: [],
        dynamicQuestions: [
          {
            id: 'D01',
            kind: 'dynamic',
            category: 'Integraciones',
            question: '¿Existe API?',
            reason: 'Cambia el esfuerzo de integración.',
            impact: 'high',
            answerType: 'single_choice',
            options: [
              { value: 'yes', label: 'Sí' },
              { value: 'no', label: 'No' },
            ],
            required: true,
            canPrefill: false,
            confidence: 'low',
            priorityScore: 3,
            sourceRefs: [],
            dependsOn: [],
          },
        ],
      }),
    };

    const result = await new AnalyzeEstimationPocUseCase(ai).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'Proyecto',
      clientName: 'Cliente',
      driveFolderUrl: 'https://drive.google.com/drive/folders/demo',
      instructions: null,
    });

    expect(result.documentsAnalyzed).toBe(0);
    expect(result.dynamicQuestions).toHaveLength(1);
    expect(result.dynamicQuestions[0]?.kind).toBe('dynamic');
    expect(result).not.toHaveProperty('roles');
    expect(result).not.toHaveProperty('totalHours');
  });
  it('pide preguntas dinámicas a Gemini usando el documento KDM real de la fuente de demo', async () => {
    const sourceId = 'kora-poc-requerimiento-kdm';
    const phases: string[] = [];
    const seen: { documents?: unknown; task?: string } = {};
    const ai: AiProvider = {
      name: 'gemini',
      generateStructured: async (request) => {
        // Los eventos de lectura y envío anteceden a la llamada al modelo,
        // sin esperar que Gemini publique thought summaries.
        expect(phases).toEqual([
          'documents:Documentación leída: 1 archivo(s) disponibles para el análisis.',
          'gemini:Enviando los antecedentes al agente IA para elaborar el entendimiento.',
        ]);
        seen.documents = request.documents;
        seen.task = request.task;
        return {
          summary: 'KDM requiere confirmar disponibilidad de APIs.',
          fixedPrefills: [
            { questionId: 'F01', value: 'mvp', sourceId, reason: 'Primera versión documentada' },
            { questionId: 'F04', value: 'none,uat', sourceId, reason: 'Contradicción' },
            { questionId: 'F02', value: '8 semanas', sourceId: 'otro-doc', reason: 'Fuente no incluida' },
          ],
          dynamicQuestions: [{
            id: 'ejemplo', kind: 'dynamic',
            category: 'Integraciones', question: '¿Existe API SAP documentada?',
            reason: 'La implementación cambia las HH.',
            impact: 'high', answerType: 'single_choice',
            options: [
              { value: 'yes', label: 'Sí' },
              { value: 'no', label: 'No' },
            ],
            required: true, confidence: 'medium', priorityScore: 5,
            sourceRefs: [{ sourceId, fileName: 'Requerimiento_KDM.pdf' }],
          }],
        };
      },
    };
    const sources: DocumentSourceReader = {
      readDriveSources: async () => [{
        sourceId, name: 'Requerimiento_KDM.pdf',
        mimeType: 'application/pdf', path: 'Levantamiento/Requerimiento_KDM.pdf',
        text: 'El sistema integra SAP, verificar APIs disponibles.',
      }],
    };
    const result = await new AnalyzeEstimationPocUseCase(ai, sources).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'Proyecto', clientName: 'Cliente',
      driveFolderUrl: 'https://drive.google.com/drive/folders/kora-poc-fallback',
      instructions: null,
    }, undefined, undefined, (phase, text) => phases.push(phase + ':' + text));
    expect(seen.task).toBe('estimation.poc.analysis');
    expect(seen.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Requerimiento_KDM.pdf' }),
    ]));
    expect(result.provider).toBe('gemini');
    expect(result.sourceMode).toBe('poc_simulated');
    expect(result.documentsAnalyzed).toBe(1);
    expect(result.detectedDocuments).toEqual(['Requerimiento_KDM.pdf']);
    expect(result.fixedPrefills).toEqual([{
      questionId: 'F01', value: 'mvp',
      sourceRefs: [{ sourceId, fileName: 'Requerimiento_KDM.pdf' }],
    }]);
    expect(result.dynamicQuestions[0]).toMatchObject({
      id: 'D01',
      sourceRefs: [{ sourceId, fileName: 'Requerimiento_KDM.pdf' }],
    });
  });

  it('OpenAI solicita tipos estructurados y conserva Otro sin inventar opciones', async () => {
    const sourceId = 'drive-rules';
    let instructions = '';
    const makeQuestion = (id: string, answerType: string,
      options: Array<{ value: string; label: string }>) => ({
      id, kind: 'dynamic', category: 'Alcance', question: '¿Qué alcance se confirma?',
      reason: 'Modifica HH y arquitectura', impact: 'high', answerType, options,
      required: true, confidence: 'medium', priorityScore: 90,
      assumptionIfSkipped: 'Pendiente de confirmar',
      sourceRefs: [{ sourceId, fileName: 'Reglas.xlsx' }],
    });
    const ai: AiProvider = { name: 'openai',
      generateStructured: async (request) => {
        instructions = request.instructions ?? '';
        return { summary: 'Alcance pendiente de decisiones.',
          dynamicQuestions: [
            makeQuestion('Q1', 'single_choice', [
              { value: 'app', label: 'Aplicación nueva' },
              { value: 'existing', label: 'Adaptar aplicación actual' },
              { value: 'other', label: 'Otro' },
            ]),
            makeQuestion('Q2', 'multi_choice', [
              { value: 'web', label: 'Web' },
              { value: 'mobile', label: 'Móvil' },
            ]),
            makeQuestion('Q3', 'confirmation', []),
            makeQuestion('Q4', 'text', []),
            // Si OpenAI devuelve una selección sin opciones, no se inventan.
            makeQuestion('Q5', 'single_choice', []),
          ],
        };
      },
    };
    const reader: DocumentSourceReader = { readDriveSources: async () => [{
      sourceId, name: 'Reglas.xlsx', mimeType: 'text/plain',
      path: 'Requisitos/Reglas.xlsx', text: 'HOJA Matriz B2=Control de acceso',
    }] };
    const output = await new AnalyzeEstimationPocUseCase(ai, reader).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'Controles', clientName: 'Cliente',
      driveFolderUrl: 'https://drive.google.com/drive/folders/real-folder',
      instructions: null,
    });
    expect(instructions).toContain('prioriza preguntas rápidas y estructuradas');
    expect(instructions).toContain('Otro (especificar)');
    expect(output.provider).toBe('openai');
    expect(output.dynamicQuestions.map((q) => q.answerType)).toEqual([
      'single_choice', 'multi_choice', 'confirmation', 'text', 'text',
    ]);
    expect(output.dynamicQuestions[0]?.options).toEqual([
      { value: 'app', label: 'Aplicación nueva' },
      { value: 'existing', label: 'Adaptar aplicación actual' },
      { value: 'other', label: 'Otro (especificar)' },
    ]);
    expect(output.dynamicQuestions[4]?.options).toEqual([]);
    expect(output.dynamicQuestions.every((q) =>
      q.sourceRefs[0]?.sourceId === sourceId)).toBe(true);
  });

  it('OpenAI no descarta un cuestionario completo por textos descriptivos demasiado largos', async () => {
    const sourceId = 'drive-rules';
    const ai: AiProvider = {
      name: 'openai',
      generateStructured: async () => ({
        summary: 'Resumen extendido. '.repeat(230),
        dynamicQuestions: [{
          id: 'Q1', kind: 'dynamic', category: 'A'.repeat(250),
          question: '¿Qué restricción de control se confirma? '.repeat(60),
          reason: 'Impacta permisos. '.repeat(140),
          impact: 'high', answerType: 'single_choice',
          options: [
            { value: 'per_site', label: 'Permisos separados por sitio. '.repeat(20) },
            { value: 'shared', label: 'Permisos centralizados. '.repeat(20) },
          ],
          required: true, confidence: 'medium', priorityScore: 90,
          assumptionIfSkipped: 'Escenario pendiente. '.repeat(100),
          sourceRefs: [{ sourceId, excerpt: 'Matriz de acceso. '.repeat(200) }],
        }],
      }),
    };
    const reader: DocumentSourceReader = { readDriveSources: async () => [{
      sourceId, name: 'Roles.xlsx', mimeType: 'text/plain',
      path: 'Levantamiento/Roles.xlsx', text: 'HOJA Matriz, B2: control por sitio',
    }] };
    const result = await new AnalyzeEstimationPocUseCase(ai, reader).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'Portal', clientName: 'Cliente',
      driveFolderUrl: 'https://drive.google.com/drive/folders/real-folder',
      instructions: null,
    });
    const question = result.dynamicQuestions[0]!;
    expect(result.summary.length).toBeLessThanOrEqual(3000);
    expect(question.category.length).toBeLessThanOrEqual(120);
    expect(question.question.length).toBeLessThanOrEqual(1500);
    expect(question.reason?.length).toBeLessThanOrEqual(1500);
    expect(question.assumptionIfSkipped?.length).toBeLessThanOrEqual(1500);
    expect(question.options).toHaveLength(2);
    expect(question.options.every((o) => o.label.length <= 300)).toBe(true);
    expect(question.sourceRefs[0]?.excerpt?.length).toBeLessThanOrEqual(1000);
    expect(question.sourceRefs[0]?.sourceId).toBe(sourceId);
  });

  it('rechaza aclaraciones que citan archivos inexistentes o ajenos al KDM', async () => {
    const ai: AiProvider = {
      name: 'gemini',
      generateStructured: async () => ({
        summary: 'Análisis',
        dynamicQuestions: [{
          id: 'D01', kind: 'dynamic', category: 'SAP',
          question: '¿API?', reason: 'Impacta integración',
          impact: 'high', answerType: 'text', options: [], required: true,
          sourceRefs: [{ sourceId: 'otro-documento', fileName: 'otro.pdf' }],
        }],
      }),
    };
    const reader: DocumentSourceReader = {
      readDriveSources: async () => [{
        sourceId: 'kora-poc-requerimiento-kdm', name: 'Requerimiento_KDM.pdf',
        mimeType: 'application/pdf', path: 'Demo/KDM', text: 'SAP',
      }],
    };
    await expect(new AnalyzeEstimationPocUseCase(ai, reader).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'Proyecto', clientName: 'Cliente',
      driveFolderUrl: 'https://drive.google.com/drive/folders/kora-poc-fallback',
      instructions: null,
    })).rejects.toThrow(/documento proporcionado/);
  });

});
