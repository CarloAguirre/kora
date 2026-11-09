import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimationPocProposalSchema, quotationReferenceEdtSchema } from '@kora/contracts';
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
    expect(result.totalHours).toBe(180); // 160 dev + 4 semanas x 5 HH TL
    expect(result.roles.find((role) => role.role === 'Líder Técnico')).toMatchObject({
      unit: 'week', duration: 4, hoursPerUnit: 5, people: 1, totalHours: 20,
    });
  });
  it('usa catálogo real en el prompt y rechaza perfiles con IDs ajenos a Kora', async () => {
    const teamId = '0777e456-fd76-445e-83f1-afc25061c103';
    const catalog = [{ teamId, name: 'Desarrollo' }];
    // La política de 5 HH/semana se aplica a fuentes Drive reales,
    // no al identificador reservado para la demostración KDM.
    const realInput = {
      ...input, driveFolderUrl: 'https://drive.google.com/drive/folders/real-catalog',
    };
    let activeCatalog: unknown = null;
    let requiredFields: unknown = null;
    const ai: AiProvider = {
      name: 'gemini',
      generateStructured: async (request) => {
        activeCatalog = (request.context as Record<string, unknown>).activeKoraTeams;
        const response = request.responseJsonSchema as {
          properties: { roles: { items: { required: unknown } } };
        };
        requiredFields = response.properties.roles.items.required;
        return {
          summary: 'Construir la API documentada',
          roles: [{
            role: 'Desarrollador Backend', teamId,
            unit: 'week', duration: 2, hoursPerUnit: 40, people: 1,
            source: 'Requerimiento_KDM.pdf',
          }],
          assumptions: [], clarifyingQuestions: [],
        };
      },
    };
    const generator = new GenerateEstimationPocProposalUseCase(ai, sources);
    const result = await generator.execute(realInput, catalog);
    expect(activeCatalog).toEqual(catalog);
    expect(requiredFields).toContain('teamId');
    expect(result.roles[0]?.teamId).toBe(teamId);
    expect(result.roles[0]?.role).toBe('Desarrollador Backend');
    expect(result.roles.find((role) => role.role === 'Líder Técnico')).toMatchObject({
      teamId, duration: 2, hoursPerUnit: 5, totalHours: 10,
    });
    expect(result.totalHours).toBe(90);

    const invalid: AiProvider = {
      name: 'gemini',
      generateStructured: async () => ({
        summary: 'Sin equipo válido',
        roles: [{
          role: 'Desarrollador Backend',
          teamId: '0777e456-fd76-445e-83f1-afc25061c104',
          unit: 'week', duration: 1, hoursPerUnit: 40, people: 1,
        }],
        assumptions: [], clarifyingQuestions: [],
      }),
    };
    await expect(new GenerateEstimationPocProposalUseCase(invalid, sources)
      .execute(realInput, catalog)).rejects.toThrow(/equipo activo válido/);
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
  const proposal = (roles: Array<{ role: string; hours: number }>, provider: 'gemini' | 'openai' = 'gemini') =>
    estimationPocProposalSchema.parse({
      projectId, provider, sourceMode: 'poc_simulated',
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
      { wbs: 'T01.01', role: 'Desarrollo', hours: 12,
        taskName: 'Implementar servicio de integración API',
        taskDescription: 'Construir el endpoint REST, manejar validaciones y errores.' },
      { wbs: 'T01.01', role: 'QA', hours: 3,
        taskName: 'Validar el contrato y errores de la API',
        taskDescription: 'Ejecutar pruebas del contrato REST y registrar defectos.' },
      { wbs: 'T01.02', role: 'Desarrollo', hours: 40,
        taskName: 'Implementar interfaz de operación',
        taskDescription: 'Construir componentes React conectados a la API.' },
      { wbs: 'T02.01', role: 'QA', hours: 24,
        taskName: 'Ejecutar pruebas de aceptación de flujos',
        taskDescription: 'Verificar criterios de negocio y documentar resultados UAT.' },
    ],
  });
  const createGenerator = (output: (attempt: number, instructions?: string) => unknown,
    provider: 'gemini' | 'openai' = 'gemini') => {
    // El default de producción ahorra cuota. Los tests de corrección activan
    // explícitamente el segundo intento y jamás contactan al proveedor real.
    vi.stubEnv('KORA_GEMINI_EDT_MAX_ATTEMPTS', '2');
    let calls = 0;
    const instructions: string[] = [];
    const requestedSchemas: Array<Readonly<Record<string, unknown>> | undefined> = [];
    const ai: AiProvider = {
      name: provider,
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


  it('corrige dotación inicial sobredimensionada con HH de EDT, sin modificar esfuerzo', () => {
    const preliminary = estimationPocProposalSchema.parse({
      projectId, provider: 'gemini', sourceMode: 'drive', documentsAnalyzed: 1,
      summary: 'Estimación inicial de Gemini',
      roles: [
        { role: 'Desarrollo', unit: 'week', duration: 2, hoursPerUnit: 10,
          people: 4, totalHours: 80, source: 'Requerimiento_KDM.pdf' },
        { role: 'QA', unit: 'week', duration: 3, hoursPerUnit: 10,
          people: 3, totalHours: 90, source: 'Requerimiento_KDM.pdf' },
      ], totalHours: 170, assumptions: [], clarifyingQuestions: [],
    });
    const edt = quotationReferenceEdtSchema.parse({
      schemaVersion: 'kora.quotation.reference-edt.v2',
      source: 'drive', provider: 'gemini', totalHours: 120,
      reservePercent: 0, reserveHours: 0, totalWithReserve: 120,
      stages: [
        { code: 'S1', name: 'Desarrollo', startWeek: 1, durationWeeks: 2, totalHours: 100 },
        { code: 'S2', name: 'QA', startWeek: 3, durationWeeks: 1, totalHours: 20 },
      ],
      modules: [{ name: 'Portal', totalHours: 120, tasks: [
        { wbs: 'S1.01', name: 'Implementar', description: 'API',
          role: 'Desarrollo', hours: 100, stageCode: 'S1',
          roleEffort: [{ role: 'Desarrollo', hours: 100 }] },
        { wbs: 'S2.01', name: 'Validar', description: 'Pruebas',
          role: 'QA', hours: 20, stageCode: 'S2',
          roleEffort: [{ role: 'QA', hours: 20 }] },
      ] }],
    });
    const ai: AiProvider = { name: 'gemini', generateStructured: async () => ({}) };
    const generator = new GenerateEstimationPocProposalUseCase(ai, sources);
    const reconciled = generator.reconcileProposalWithEdt(preliminary, edt);
    expect(reconciled.roles.find((role) => role.role === 'Desarrollo')).toMatchObject({
      people: 2, duration: 2, totalHours: 100, hoursPerUnit: 25,
    });
    expect(reconciled.roles.find((role) => role.role === 'QA')).toMatchObject({
      people: 1, duration: 1, totalHours: 20, hoursPerUnit: 20,
    });
    expect(reconciled.totalHours).toBe(120);
    expect(edt.totalHours).toBe(120);
  });

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
    const allowedRoles = contexts[1]?.allowedRoles as Array<Record<string, unknown>>;
    expect(allowedRoles.every((role) => !('people' in role) &&
      !('estimatedDuration' in role) && !('unit' in role))).toBe(true);
    expect(contexts[1]?.preliminaryAssumptions).toEqual(['Confirmar interfaz final de SAP']);
    expect(contexts[1]?.unresolvedPreliminaryQuestions).toEqual([
      '¿Quién habilita la conectividad SAP?',
    ]);
    expect(edt.totalHours).toBe(79);
  });

  it('garantiza en Drive real 5 HH semanales al TL y reconcilia duración EDT', async () => {
    const realInput = {
      ...input, driveFolderUrl: 'https://drive.google.com/drive/folders/demo-real',
    };
    const ai: AiProvider = {
      name: 'gemini',
      generateStructured: async (request) => {
        if (request.task === 'estimation.poc.proposal') {
          return {
            summary: 'Portal documentado',
            roles: [
              { role: 'Desarrollo', unit: 'week', duration: 2, hoursPerUnit: 40,
                people: 1, source: 'KDM.pdf' },
              { role: 'QA', unit: 'week', duration: 2, hoursPerUnit: 10,
                people: 1, source: 'KDM.pdf' },
            ],
            assumptions: [], clarifyingQuestions: [],
          };
        }
        return baseDetail();
      },
    };
    const generator = new GenerateEstimationPocProposalUseCase(ai, sources);
    const prelim = await generator.execute(realInput);
    expect(prelim.roles.find((role) => role.role === 'Líder Técnico'))
      .toMatchObject({ duration: 2, hoursPerUnit: 5, totalHours: 10 });

    const edt = await generator.generateEdt(realInput, prelim);
    expect(edt.stages?.find((stage) => stage.code === 'TL-GOV')).toMatchObject({
      startWeek: 1, durationWeeks: 3, totalHours: 15,
    });
    expect(edt.totalHours).toBe(94); // 79 HH de features + 3 semanas x 5
    const reconciled = generator.reconcileProposalWithEdt(prelim, edt);
    expect(reconciled.roles.find((role) => role.role === 'Líder Técnico'))
      .toMatchObject({ duration: 3, hoursPerUnit: 5, totalHours: 15 });
    expect(reconciled.totalHours).toBe(94);
  });

  it('ignora un tramo vacío de Gemini sin perder actividades, HH ni consumir otro intento', async () => {
    const mock = createGenerator(() => {
      const data = baseDetail();
      data.stages.push({
        code: 'T03', name: 'Preparación referencial sin tareas',
        startWeek: 25, durationWeeks: 3,
      });
      return data;
    });
    vi.stubEnv('KORA_GEMINI_EDT_MAX_ATTEMPTS', '1');
    const edt = await mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ]));
    expect(mock.calls()).toBe(1);
    expect(edt.stages?.map((stage) => stage.code)).toEqual(['T01', 'T02']);
    expect(edt.modules.flatMap((module) => module.tasks.map((task) => task.wbs)))
      .toEqual(['T01.01', 'T01.02', 'T02.01']);
    expect(edt.totalHours).toBe(79);
    expect(edt.stages?.reduce((sum, stage) => sum + stage.totalHours, 0)).toBe(79);
  });

  it('un tramo vacío no infla las 5 HH semanales obligatorias del Líder Técnico', async () => {
    const mock = createGenerator(() => {
      const data = baseDetail();
      data.stages.push({
        code: 'T03', name: 'Calendario sin actividades',
        startWeek: 25, durationWeeks: 4,
      });
      return data;
    });
    const preliminary = proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ]);
    const realProposal = estimationPocProposalSchema.parse({
      ...preliminary, sourceMode: 'drive',
      roles: [...preliminary.roles, {
        role: 'Líder Técnico', unit: 'week', duration: 3,
        hoursPerUnit: 5, people: 1, totalHours: 15,
      }],
      totalHours: 95,
    });
    vi.stubEnv('KORA_GEMINI_EDT_MAX_ATTEMPTS', '1');
    const edt = await mock.generator.generateEdt({
      ...input, driveFolderUrl: 'https://drive.google.com/drive/folders/demo-real',
    }, realProposal);
    expect(mock.calls()).toBe(1);
    expect(edt.stages?.map((stage) => stage.code).sort())
      .toEqual(['T01', 'T02', 'TL-GOV']);
    expect(edt.stages?.find((stage) => stage.code === 'TL-GOV'))
      .toMatchObject({ durationWeeks: 3, totalHours: 15 });
    expect(edt.totalHours).toBe(94);
  });

  it('sigue rechazando actividades sin HH, no las oculta como tramos vacíos', async () => {
    const mock = createGenerator(() => {
      const data = baseDetail();
      data.roleHours = data.roleHours.filter((effort) => effort.wbs !== 'T02.01');
      return data;
    });
    vi.stubEnv('KORA_GEMINI_EDT_MAX_ATTEMPTS', '1');
    await expect(mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ]))).rejects.toThrow(/actividad T02\.01 no tiene HH por perfil/);
    expect(mock.calls()).toBe(1);
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

  it('OpenAI no pierde la EDT ni reintenta si classification excede 40 caracteres', async () => {
    const longLabel = 'Integración transversal y automatización de controles regulatorios de ambiente';
    const mock = createGenerator(() => {
      const data = baseDetail();
      for (const activity of data.activities) activity.classification = longLabel;
      return data;
    }, 'openai');
    vi.stubEnv('KORA_EDT_MAX_ATTEMPTS', '1');
    const edt = await mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ], 'openai'));
    expect(mock.calls()).toBe(1);
    expect(mock.instructions[0]).toContain('máximo 40 caracteres');
    expect(edt.provider).toBe('openai');
    expect(edt.totalHours).toBe(79);
    expect(edt.modules[0]?.tasks[0]?.classification?.length).toBeLessThanOrEqual(40);
    expect(edt.modules[0]?.tasks[0]?.classification).toContain('…');
    expect(edt.modules[0]?.tasks[0]?.description).toBe('Servicio de integración.');
    expect(edt.modules[0]?.tasks[0]?.roleEffort?.[0]?.hours).toBe(12);
  });

  it('acepta referencias largas con comas desde OpenAI sin repetir el análisis', async () => {
    const citation = 'Roles.xlsx, Hoja Matriz, B2:B5 y descripción del acceso supervisado '.repeat(3).trim();
    const mock = createGenerator(() => {
      const response = baseDetail();
      response.activities[0]!.references = 'RN-01;' + citation + ';Reglas.pdf · página 12';
      return response;
    }, 'openai');
    vi.stubEnv('KORA_EDT_MAX_ATTEMPTS', '1');
    const edt = await mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ], 'openai'));
    expect(mock.calls()).toBe(1);
    expect(mock.instructions[0]).toContain('conserva las referencias extensas');
    expect(edt.modules[0]?.tasks[0]?.referenceIds).toEqual([
      'RN-01', citation, 'Reglas.pdf · página 12',
    ]);
    expect(edt.modules[0]?.tasks[0]?.hours).toBe(15);
    expect(edt.totalHours).toBe(79);
  });

  it('agrupa más de 30 códigos cortos sin perder ninguna referencia', async () => {
    const refs = Array.from({ length: 35 }, (_, i) =>
      'RN-' + String(i + 1).padStart(2, '0'));
    const mock = createGenerator(() => {
      const response = baseDetail();
      response.activities[0]!.references = refs.join(';');
      return response;
    }, 'openai');
    vi.stubEnv('KORA_EDT_MAX_ATTEMPTS', '1');
    const edt = await mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ], 'openai'));
    const actual = edt.modules[0]?.tasks[0]?.referenceIds ?? [];
    expect(actual).toHaveLength(30);
    expect(actual.slice(0, 29)).toEqual(refs.slice(0, 29));
    expect(actual[29]).toBe(refs.slice(29).join(';'));
    expect(mock.calls()).toBe(1);
  });

  it('OpenAI conserva descripciones y citas extensas y acota solo etiquetas de EDT', async () => {
    const long = 'Regla técnica de operación, auditoría y permisos; '.repeat(100);
    const reference = 'Documento-Control.xlsx · HOJA Reglas!B12 · ' + 'Z'.repeat(5000);
    const stageName = 'Construcción de integración y controles; '.repeat(15);
    const mock = createGenerator(() => {
      const data = baseDetail();
      data.stages[0]!.name = stageName;
      data.activities[0]!.module = 'Módulo de implementación y control; '.repeat(15);
      data.activities[0]!.submodule = stageName;
      data.activities[0]!.name = stageName;
      data.activities[0]!.description = long;
      data.activities[0]!.references = reference;
      data.roleHours[0]!.taskName = stageName;
      data.roleHours[0]!.taskDescription = long;
      return data;
    }, 'openai');
    vi.stubEnv('KORA_EDT_MAX_ATTEMPTS', '1');
    const edt = await mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ], 'openai'));
    expect(mock.calls()).toBe(1);
    expect(edt.totalHours).toBe(79);
    expect(edt.stages?.[0]?.name.length).toBeLessThanOrEqual(300);
    expect(edt.modules[0]?.name.length).toBeLessThanOrEqual(300);
    const task = edt.modules[0]?.tasks[0];
    expect(task?.name.length).toBeLessThanOrEqual(300);
    expect(task?.roleEffort?.[0]?.taskName?.length).toBeLessThanOrEqual(300);
    expect(task?.description).toBe(long.trim());
    expect(task?.roleEffort?.[0]?.taskDescription).toBe(long.trim());
    expect(task?.referenceIds?.[0]).toBe(reference);
  });

  it('informa OpenAI (nunca Gemini) cuando el contenido de una EDT es realmente inválido', async () => {
    const mock = createGenerator(() => {
      const data = baseDetail();
      data.roleHours[0]!.hours = 12.123;
      return data;
    }, 'openai');
    vi.stubEnv('KORA_EDT_MAX_ATTEMPTS', '1');
    await expect(mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ], 'openai'))).rejects.toThrow(/OpenAI devolvió una EDT inconsistente/);
    expect(mock.calls()).toBe(1);
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
      { role: 'Desarrollo', hours: 12,
        taskName: 'Implementar servicio de integración API',
        taskDescription: 'Construir el endpoint REST, manejar validaciones y errores.' },
      { role: 'QA', hours: 3,
        taskName: 'Validar el contrato y errores de la API',
        taskDescription: 'Ejecutar pruebas del contrato REST y registrar defectos.' },
    ]);
    const schema = JSON.stringify(mock.requestedSchemas[0]);
    expect(schema).toContain('taskName');
    expect(schema).toContain('taskDescription');
    expect(edt.modules[0]?.tasks[0]?.referenceIds).toEqual(['R01', 'R03']);
    expect(edt.stages?.map((stage) => stage.totalHours)).toEqual([55, 24]);
    expect(edt.reserveHours).toBe(7.9);
    expect(edt.totalWithReserve).toBe(86.9);
    const reconciled = mock.generator.reconcileProposalWithEdt(preliminary, edt);
    expect(reconciled.roles.map((role) => role.totalHours)).toEqual([52, 27]);
    expect(preliminary.totalHours).toBe(80);
  });


  it('rechaza que dos perfiles reciban la misma descripción dentro de un WBS', async () => {
    const mock = createGenerator(() => {
      const data = baseDetail();
      data.roleHours[1]!.taskName = 'Ejecutar pruebas del contrato REST';
      data.roleHours[1]!.taskDescription = data.roleHours[0]!.taskDescription;
      return data;
    });
    vi.stubEnv('KORA_GEMINI_EDT_MAX_ATTEMPTS', '1');
    await expect(mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ]))).rejects.toThrow(/repite la misma tarea o descripción/);
    expect(mock.calls()).toBe(1);
  });

  it('rechaza tareas por perfil vacías o sin entregable verificable', async () => {
    const mock = createGenerator(() => {
      const data = baseDetail();
      data.roleHours[0]!.taskName = '';
      return data;
    });
    vi.stubEnv('KORA_GEMINI_EDT_MAX_ATTEMPTS', '1');
    await expect(mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ]))).rejects.toThrow(/taskName/);
    expect(mock.calls()).toBe(1);
  });

  it('rechaza fases equivalentes con el mismo nombre y semanas', async () => {
    const mock = createGenerator(() => {
      const data = baseDetail();
      data.stages.push({ code: 'T03', name: 'analisis', startWeek: 1, durationWeeks: 2 });
      return data;
    });
    vi.stubEnv('KORA_GEMINI_EDT_MAX_ATTEMPTS', '1');
    await expect(mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ]))).rejects.toThrow(/Dos fases tienen el mismo nombre/);
  });

  it('rechaza dos WBS con mismo módulo, etapa, título y descripción', async () => {
    const mock = createGenerator(() => {
      const data = baseDetail();
      data.activities[1] = {
        ...data.activities[0]!, wbs: 'T01.02',
      };
      return data;
    });
    vi.stubEnv('KORA_GEMINI_EDT_MAX_ATTEMPTS', '1');
    await expect(mock.generator.generateEdt(input, proposal([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 30 },
    ]))).rejects.toThrow(/duplica el mismo título y descripción/);
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


  it('dimensiona desde una EDT más grande que la propuesta sin repetir Gemini ni inflar HH', async () => {
    const mock = createGenerator(() => {
      const data = baseDetail();
      data.roleHours[2]!.hours = 200; // etapa T01: 212 HH Dev en 2 semanas
      return data;
    });
    vi.stubEnv('KORA_GEMINI_EDT_MAX_ATTEMPTS', '1');
    const preliminary = proposal([
      { role: 'Desarrollo', hours: 50 },
      { role: 'QA', hours: 30 },
    ]);
    const edt = await mock.generator.generateEdt(input, preliminary);
    expect(mock.calls()).toBe(1);
    expect(edt.totalHours).toBe(239); // 79 originales + 160 adicionales
    const reconciled = mock.generator.reconcileProposalWithEdt(preliminary, edt);
    expect(reconciled.roles.find((role) => role.role === 'Desarrollo')?.people)
      .toBe(3); // 106 HH por semana / 40 = 3 personas peak
    expect(reconciled.roles.find((role) => role.role === 'QA')?.people).toBe(1);
    expect(reconciled.totalHours).toBe(239);
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
    ]))).rejects.toThrow(/sin reintento automático/);
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
      result.roleHours.push({ wbs: 'T01.01', role: 'QA', hours: 5,
        taskName: 'Repetido QA', taskDescription: 'Prueba duplicada.' });
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
      result.roleHours.push({ wbs: 'T99.99', role: 'QA', hours: 2,
        taskName: 'Tarea ajena', taskDescription: 'Tarea inexistente.' });
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
