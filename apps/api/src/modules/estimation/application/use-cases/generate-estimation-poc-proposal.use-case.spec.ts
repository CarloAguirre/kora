import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimationPocProposalSchema } from '@kora/contracts';
import type { AiProvider } from '../../../ai/application/ports/ai-provider.port';
import type { DocumentSourceReader } from '../ports/document-source-reader.port';
import type { DriveFolderClient } from '../ports/drive-folder-client.port';
import { GoogleDriveDocumentSourceReader } from '../../infrastructure/drive/google-drive-document-source.reader';
import { GenerateEstimationPocProposalUseCase } from './generate-estimation-poc-proposal.use-case';

describe('GenerateEstimationPocProposalUseCase', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('calcula las HH fuera del proveedor IA', async () => {
    const ai: AiProvider = {
      name: 'poc-ai',
      generateStructured: async () => ({
        summary: 'Propuesta',
        roles: [
          {
            role: 'Desarrollador',
            unit: 'week',
            duration: 2,
            hoursPerUnit: 40,
            people: 2,
            source: 'Fuente PoC',
          },
          {
            role: 'QA',
            unit: 'day',
            duration: 3,
            hoursPerUnit: 8,
            people: 1,
            source: 'Fuente PoC',
          },
        ],
        assumptions: ['Supuesto'],
        clarifyingQuestions: ['Pregunta'],
      }),
    };
    const sources: DocumentSourceReader = {
      readDriveSources: async () => [],
    };

    const result = await new GenerateEstimationPocProposalUseCase(
      ai,
      sources,
    ).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'Proyecto',
      clientName: 'Cliente',
      driveFolderUrl: 'https://drive.google.com/drive/folders/demo',
      instructions: null,
      answers: [],
    });

    expect(result.roles[0]?.totalHours).toBe(160);
    expect(result.roles[1]?.totalHours).toBe(24);
    expect(result.totalHours).toBe(184);
    expect(result.sourceMode).toBe('poc_simulated');
    expect(result.documentsAnalyzed).toBe(0);
  });


  it('usa Requerimiento_KDM.pdf con Gemini mientras Drive no está configurado', async () => {
    let receivedDocumentName: string | null = null;
    let receivedDocumentText = '';

    const ai: AiProvider = {
      name: 'gemini',
      generateStructured: async (request) => {
        receivedDocumentName = request.documents?.[0]?.name ?? null;
        receivedDocumentText = request.documents?.[0]?.text ?? '';

        return {
          summary: 'Estimación generada desde KDM',
          roles: [
            {
              role: 'Desarrollador Fullstack',
              unit: 'week',
              duration: 4,
              hoursPerUnit: 40,
              people: 1,
              source: 'Requerimiento_KDM.pdf',
            },
          ],
          assumptions: [],
          clarifyingQuestions: [],
        };
      },
    };

    const drive: DriveFolderClient = {
      isConfigured: () => false,
      listFiles: async () => [],
      listChildren: async () => [],
      searchFolders: async () => [],
      getMetadata: async () => null,
      readAnalysisContent: async () => null,
    };

    const sources = new GoogleDriveDocumentSourceReader(drive);

    const result = await new GenerateEstimationPocProposalUseCase(
      ai,
      sources,
    ).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'Prospecto cualquiera',
      clientName: 'Cliente',
      driveFolderUrl:
        'https://drive.google.com/drive/folders/kora-poc-fallback',
      instructions: null,
      answers: [],
    });

    expect(receivedDocumentName).toBe('Requerimiento_KDM.pdf');
    expect(receivedDocumentText).toContain('Facele');
    expect(receivedDocumentText).toContain('SAP');
    expect(result.documentsAnalyzed).toBe(1);
    expect(result.sourceMode).toBe('poc_simulated'); // Gemini real, fuentes KDM de DEMO
    expect(result.totalHours).toBe(160);
  });

  it('entrega los documentos de Drive al proveedor real', async () => {
    let receivedDocumentCount = 0;
    const ai: AiProvider = {
      name: 'gemini',
      generateStructured: async (request) => {
        receivedDocumentCount = request.documents?.length ?? 0;
        return {
          summary: 'Estimación basada en antecedentes',
          roles: [
            {
              role: 'Desarrollador Fullstack',
              unit: 'week',
              duration: 4,
              hoursPerUnit: 40,
              people: 1,
              source: 'Requerimientos.pdf',
            },
          ],
          assumptions: [],
          clarifyingQuestions: [],
        };
      },
    };
    const sources: DocumentSourceReader = {
      readDriveSources: async () => [
        {
          sourceId: 'pdf-1',
          name: 'Requerimientos.pdf',
          mimeType: 'application/pdf',
          path: 'Levantamiento/Requerimientos.pdf',
          dataBase64: 'ZGVtbw==',
        },
      ],
    };

    const result = await new GenerateEstimationPocProposalUseCase(
      ai,
      sources,
    ).execute({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      projectName: 'Proyecto',
      clientName: 'Cliente',
      driveFolderUrl: 'https://drive.google.com/drive/folders/demo',
      instructions: null,
      answers: [],
    });

    expect(receivedDocumentCount).toBe(1);
    expect(result.provider).toBe('gemini');
    expect(result.sourceMode).toBe('drive');
    expect(result.documentsAnalyzed).toBe(1);
    expect(result.totalHours).toBe(160);
  });
  const projectId = '550e8400-e29b-41d4-a716-446655440000';
  const input = {
    projectId, projectName: 'KDM', clientName: 'Cliente',
    driveFolderUrl: 'https://drive.google.com/drive/folders/kora-poc-fallback',
    instructions: null, answers: [],
  };
  const sources: DocumentSourceReader = {
    readDriveSources: async () => [{
      sourceId: 'kora-poc-requerimiento-kdm',
      name: 'Requerimiento_KDM.pdf', mimeType: 'application/pdf',
      path: 'KDM.pdf', text: 'Portal, API y pruebas del documento.',
    }],
  };
  const proposal = (roles: Array<{ role: string; hours: number }>) =>
    estimationPocProposalSchema.parse({
      projectId, provider: 'gemini', sourceMode: 'poc_simulated',
      documentsAnalyzed: 1, summary: 'Estimación preliminar KDM',
      roles: roles.map(({ role, hours }) => ({
        role, unit: 'week', duration: 1, hoursPerUnit: hours,
        people: 1, totalHours: hours,
      })),
      totalHours: roles.reduce((sum, row) => sum + row.hours, 0),
      assumptions: [], clarifyingQuestions: [],
    });
  const baseDetail = () => ({
    reservePercent: 10,
    stages: [
      { code: 'T01', name: 'Análisis', startWeek: 1, durationWeeks: 2 },
      { code: 'T02', name: 'Pruebas', startWeek: 3, durationWeeks: 1 },
    ],
    activities: [
      { wbs: 'T01.01', stageCode: 'T01', module: 'Portal', submodule: 'API',
        name: 'Construir API', description: 'Servicio de integración.',
        references: 'R01;R03', classification: 'C' },
      { wbs: 'T01.02', stageCode: 'T01', module: 'Portal', submodule: 'Web',
        name: 'Frontend', description: 'Interfaz de operación.',
        references: 'R04', classification: 'C' },
      { wbs: 'T02.01', stageCode: 'T02', module: 'QA', submodule: 'Regresión',
        name: 'Verificar flujo', description: 'Pruebas de aceptación.',
        references: 'R05', classification: 'C' },
    ],
    roleHours: [
      { wbs: 'T01.01', role: 'Desarrollo', hours: 12 },
      { wbs: 'T01.01', role: 'QA', hours: 3 },
      { wbs: 'T01.02', role: 'Desarrollo', hours: 40 },
      { wbs: 'T02.01', role: 'QA', hours: 24 },
    ],
  });
  const createGenerator = (output: (attempt: number, instructions?: string) => unknown) => {
    // El default de producción ahorra cuota. Los tests de corrección activan
    // explícitamente el segundo intento y jamás contactan al proveedor real.
    vi.stubEnv('KORA_GEMINI_EDT_MAX_ATTEMPTS', '2');
    let calls = 0;
    const instructions: string[] = [];
    const requestedSchemas: Array<Readonly<Record<string, unknown>> | undefined> = [];
    const ai: AiProvider = {
      name: 'gemini',
      generateStructured: async (request) => {
        calls++;
        instructions.push(request.instructions ?? '');
        requestedSchemas.push(request.responseJsonSchema);
        return output(calls, request.instructions ?? undefined);
      },
    };
    return {
      generator: new GenerateEstimationPocProposalUseCase(ai, sources),
      calls: () => calls,
      instructions,
      requestedSchemas,
    };
  };

  it('transmite decisiones humanas, supuestos y exclusiones a AMBOS procesos Gemini', async () => {
    const contexts: Array<Record<string, unknown>> = [];
    const ai: AiProvider = {
      name: 'gemini',
      generateStructured: async (request) => {
        contexts.push(request.context as Record<string, unknown>);
        if (request.task === 'estimation.poc.proposal') {
          return {
            summary: 'Propuesta preliminar trazable a KDM.',
            roles: [
              { role: 'Desarrollo', unit: 'week', duration: 2,
                hoursPerUnit: 40, people: 1, source: 'Requerimiento_KDM.pdf' },
              { role: 'QA', unit: 'week', duration: 1,
                hoursPerUnit: 40, people: 1, source: 'Requerimiento_KDM.pdf' },
            ],
            assumptions: ['Confirmar interfaz final de SAP'],
            clarifyingQuestions: ['¿Quién habilita la conectividad SAP?'],
          };
        }
        return baseDetail();
      },
    };
    const generator = new GenerateEstimationPocProposalUseCase(ai, sources);
    const context = {
      ...input,
      instructions: 'Excluir soporte de postproducción.',
      confirmedUnderstanding: 'Entendimiento del alcance confirmado por el usuario.',
      dynamicQuestions: [{
        id: 'D01', kind: 'dynamic' as const, category: 'Integración',
        question: '¿Cómo se mantendrán las equivalencias de Centros de Costo?',
        reason: 'Dos alternativas de impacto diferente.',
        impact: 'high' as const, answerType: 'single_choice' as const,
        options: [
          { value: 'local', label: 'Mantenedor Local' },
          { value: 'sap_api', label: 'Sincronización SAP API' },
        ],
        required: true, canPrefill: false, confidence: 'high' as const,
        assumptionIfSkipped: 'Suponer mantenedor local, decisión aún no confirmada.',
        priorityScore: 90,
        sourceRefs: [{ sourceId: 'kora-poc-requerimiento-kdm',
          fileName: 'Requerimiento_KDM.pdf' }],
        dependsOn: [],
      }],
      answers: [
        { questionId: 'F01', value: 'phase', usedAssumption: false },
        { questionId: 'D01', value: null, usedAssumption: true },
      ],
    };
    const preliminary = await generator.execute(context);
    const edt = await generator.generateEdt(context, preliminary);
    expect(contexts).toHaveLength(2);
    for (const payload of contexts) {
      const answers = payload.resolvedAnswers as Array<{
        questionId: string; question: string; answer: string; usedAssumption: boolean;
      }>;
      expect(answers.find((answer) => answer.questionId === 'F01')?.answer)
        .toBe('Fase específica');
      const ceCo = answers.find((answer) => answer.questionId === 'D01');
      expect(ceCo?.question).toContain('Centros de Costo');
      expect(ceCo?.answer).toContain('SUPUESTO NO CONFIRMADO');
      expect(ceCo?.usedAssumption).toBe(true);
    }
    expect(contexts[1]?.userInstructions).toBe('Excluir soporte de postproducción.');
    expect(contexts[1]?.preliminaryAssumptions).toEqual(['Confirmar interfaz final de SAP']);
    expect(contexts[1]?.unresolvedPreliminaryQuestions).toEqual([
      '¿Quién habilita la conectividad SAP?',
    ]);
    expect(edt.totalHours).toBe(79);
  });

  it('descarta roles duplicados del primer Gemini sin pedir la EDT', async () => {
    let calls = 0;
    const ai: AiProvider = {
      name: 'gemini',
      generateStructured: async () => {
        calls++;
        return {
          summary: 'Propuesta preliminar duplicada.',
          roles: [
            { role: 'Desarrollo', unit: 'week', duration: 2,
              hoursPerUnit: 40, people: 1 },
            { role: 'desarrollo', unit: 'week', duration: 2,
              hoursPerUnit: 40, people: 1 },
          ],
          assumptions: [], clarifyingQuestions: [],
        };
      },
    };
    await expect(new GenerateEstimationPocProposalUseCase(ai, sources)
      .execute(input)).rejects.toThrow(/perfil duplicado/);
    expect(calls).toBe(1);
  });

  it('genera EDT v2 desde tablas no redundantes y conserva las HH por actividad/perfil', async () => {
    const mock = createGenerator(() => baseDetail());
    const preliminary = proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ]);
    const edt = await mock.generator.generateEdt(input, preliminary);
    expect(mock.calls()).toBe(1);
    expect(mock.requestedSchemas[0]).toHaveProperty('properties');
    const jsonSchema = JSON.stringify(mock.requestedSchemas[0]);
    expect(jsonSchema).not.toMatch(/"minItems"|"maxItems"|"minimum"|"maximum"/);
    expect(jsonSchema).toContain('"roleHours"');
    expect(edt.schemaVersion).toBe('kora.quotation.reference-edt.v2');
    expect(edt.totalHours).toBe(79);
    expect(edt.modules.map((module) => module.totalHours)).toEqual([55, 24]);
    expect(edt.modules[0]?.tasks[0]?.hours).toBe(15);
    expect(edt.modules[0]?.tasks[0]?.roleEffort).toEqual([
      { role: 'Desarrollo', hours: 12 }, { role: 'QA', hours: 3 },
    ]);
    expect(edt.modules[0]?.tasks[0]?.referenceIds).toEqual(['R01', 'R03']);
    expect(edt.stages?.map((stage) => stage.totalHours)).toEqual([55, 24]);
    expect(edt.reserveHours).toBe(7.9);
    expect(edt.totalWithReserve).toBe(86.9);
    const reconciled = mock.generator.reconcileProposalWithEdt(preliminary, edt);
    expect(reconciled.roles.map((role) => role.totalHours)).toEqual([52, 27]);
    expect(preliminary.totalHours).toBe(80);
  });

  it('pide corregir HH de más de dos decimales sin prorratearlas', async () => {
    const mock = createGenerator((attempt) => {
      const result = baseDetail();
      result.roleHours[0]!.hours = attempt === 1 ? 12.123 : 12.12;
      return result;
    });
    const edt = await mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ]));
    expect(mock.calls()).toBe(2);
    expect(mock.instructions[1]).toMatch(/dos decimales/);
    expect(edt.modules[0]?.tasks[0]?.roleEffort?.[0]?.hours).toBe(12.12);
    expect(edt.totalHours).toBe(79.12);
  });

  it('regenera si Gemini repite un tramo con periodos contradictorios', async () => {
    const mock = createGenerator((attempt) => {
      const result = baseDetail();
      if (attempt === 1) {
        result.stages.push({
          code: 'T01', name: 'Análisis',
          startWeek: 3, durationWeeks: 2,
        });
      }
      return result;
    });
    const edt = await mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ]));
    expect(mock.calls()).toBe(2);
    expect(mock.instructions[1]).toContain('tramo T01');
    expect(mock.instructions[1]).toContain('duplicado');
    expect(edt.stages).toHaveLength(2);
    expect(edt.stages?.[0]?.startWeek).toBe(1);
  });

  it('por defecto NO repite una EDT inválida y preserva la cuota gratuita', async () => {
    const mock = createGenerator(() => {
      const data = baseDetail();
      data.roleHours[0]!.hours = 12.123;
      return data;
    });
    vi.stubEnv('KORA_GEMINI_EDT_MAX_ATTEMPTS', '1');
    await expect(mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ]))).rejects.toThrow(/sin reintento para ahorrar cuota/);
    expect(mock.calls()).toBe(1);
  });

  it('bloquea roles iniciales duplicados ANTES de solicitar Gemini para EDT', async () => {
    const mock = createGenerator(() => baseDetail());
    await expect(mock.generator.generateEdt(input, proposal([
      { role: 'QA', hours: 20 }, { role: 'qa', hours: 20 },
    ]))).rejects.toThrow(/perfil duplicado/);
    expect(mock.calls()).toBe(0);
  });

  it('rechaza duración o HH cero antes de generar la EDT, sin gastar segunda llamada', async () => {
    const mock = createGenerator(() => baseDetail());
    const invalid = proposal([{ role: 'Desarrollo', hours: 0 }]);
    await expect(mock.generator.generateEdt(input, invalid))
      .rejects.toThrow(/preliminares inválidas/);
    expect(mock.calls()).toBe(0);
  });

  it('rechaza un tramo que sobrepasa las 520 semanas antes de guardar la cotización', async () => {
    const mock = createGenerator(() => {
      const data = baseDetail();
      data.stages[0] = { code: 'T01', name: 'Análisis', startWeek: 520, durationWeeks: 2 };
      return data;
    });
    await expect(mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ]))).rejects.toThrow(/horizonte máximo de 520 semanas/);
    expect(mock.calls()).toBe(2);
  });

  it('elimina la causa de WBS repetido por varios perfiles: una sola definición por tarea', async () => {
    const mock = createGenerator(() => baseDetail());
    const edt = await mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ]));
    expect(edt.modules[0]?.tasks).toHaveLength(2);
    expect(edt.modules[0]?.tasks[0]?.roleEffort).toHaveLength(2);
    expect(edt.modules[0]?.tasks[0]?.hours).toBe(15);
  });

  it('nunca agrega dos asignaciones de HH del mismo perfil y WBS', async () => {
    const mock = createGenerator(() => {
      const result = baseDetail();
      result.roleHours.push({ wbs: 'T01.01', role: 'QA', hours: 5 });
      return result;
    });
    await expect(mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ]))).rejects.toThrow(/HH duplicadas.*QA.*T01.01/);
    expect(mock.calls()).toBe(2);
  });

  it('nunca fusiona actividades con WBS duplicado', async () => {
    const mock = createGenerator(() => {
      const result = baseDetail();
      result.activities.push({
        ...result.activities[0]!, name: 'Otra funcionalidad',
      });
      return result;
    });
    await expect(mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ]))).rejects.toThrow(/WBS duplicado.*T01.01/);
    expect(mock.calls()).toBe(2);
  });

  it('rechaza relaciones entre tareas y HH que no tienen respaldo en una actividad', async () => {
    const mock = createGenerator(() => {
      const result = baseDetail();
      result.roleHours.push({ wbs: 'T99.99', role: 'QA', hours: 2 });
      return result;
    });
    await expect(mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ]))).rejects.toThrow(/WBS inexistente: T99.99/);
  });

  it('rechaza perfiles ajenos a la propuesta; no crea HH ni roles de fallback', async () => {
    const mock = createGenerator(() => {
      const result = baseDetail();
      result.roleHours[0]!.role = 'Rol inexistente';
      return result;
    });
    await expect(mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ]))).rejects.toThrow(/Perfil ajeno.*Rol inexistente/);
    expect(mock.calls()).toBe(2);
  });

  it('rechaza etapas inexistentes, en lugar de asignar semanas arbitrarias', async () => {
    const mock = createGenerator(() => {
      const result = baseDetail();
      result.activities[0]!.stageCode = 'T99';
      return result;
    });
    await expect(mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ]))).rejects.toThrow(/tramo inexistente T99/);
    expect(mock.calls()).toBe(2);
  });
});
