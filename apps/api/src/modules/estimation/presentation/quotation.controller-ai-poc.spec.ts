import { BadRequestException, Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { estimationPocProposalSchema, quotationReferenceEdtSchema } from '@kora/contracts';
import { QuotationController } from './quotation.controller';
import { GetEstimationQuestionnaireDefinitionUseCase } from '../application/use-cases/get-estimation-questionnaire-definition.use-case';

const projectId = '0777e456-fd76-445e-83f1-afc25061c101';
const at = 'https://drive.google.com/drive/folders/kora-poc-fallback';
const teamId = '0777e456-fd76-445e-83f1-afc25061c103';
const catalog = [{ teamId, name: 'Desarrollo', isActive: true }];
const actor = { id: '0777e456-fd76-445e-83f1-afc25061c104',
  permissions: ['projects:manage'] };
const input = {
  projectId, projectName: 'Proyecto KDM', clientName: 'Cliente',
  driveFolderUrl: at, instructions: null,
  dynamicQuestions: [],
  answers: [
    { questionId: 'F01', value: 'mvp', usedAssumption: false },
    { questionId: 'F02', value: '8 semanas', usedAssumption: false },
    { questionId: 'F03', value: 'ideal', usedAssumption: false },
    { questionId: 'F04', value: ['none'], usedAssumption: false },
  ],
};
const proposal = estimationPocProposalSchema.parse({
  projectId, provider: 'gemini', sourceMode: 'poc_simulated',
  documentsAnalyzed: 1, summary: 'Resumen KDM',
  roles: [{
    role: 'Desarrollo', teamId, unit: 'week', duration: 1, hoursPerUnit: 40,
    people: 1, totalHours: 40, source: 'Requerimiento_KDM.pdf',
  }],
  totalHours: 40, assumptions: [], clarifyingQuestions: [],
});
const edt = quotationReferenceEdtSchema.parse({
  schemaVersion: 'kora.quotation.reference-edt.v1',
  source: 'kdm_demo', provider: 'gemini', totalHours: 40,
  modules: [{
    name: 'Portal', totalHours: 40,
    tasks: [{ wbs: '1.1', name: 'Implementación',
      description: 'Portal KDM', role: 'Desarrollo', hours: 40 }],
  }],
});
function setup() {
  const drafts = {
    authorizeAiPoc: vi.fn().mockResolvedValue(undefined),
    listActiveQuotationTeams: vi.fn().mockResolvedValue(catalog),
    createAiPocDraft: vi.fn().mockResolvedValue({
      id: '0777e456-fd76-445e-83f1-afc25061c107',
      origin: 'ai', status: 'draft', aiReviewStatus: 'pending',
    }),
  };
  const generator = { execute: vi.fn().mockResolvedValue(proposal),
    generateEdt: vi.fn().mockResolvedValue(edt),
    reconcileProposalWithEdt: vi.fn().mockReturnValue(proposal) };
  const definition = new GetEstimationQuestionnaireDefinitionUseCase();
  const controller = new QuotationController(drafts as never, generator as never, definition);
  return { drafts, generator, controller };
}

describe('POST versions/ai-poc · Gemini con KDM', () => {

  it('stream produce los dos tramos Gemini y guarda exactamente un borrador', async () => {
    const { controller, drafts, generator } = setup();
    const writes: string[] = [];
    const reply = { hijack: vi.fn(), raw: {
      destroyed: false, writableEnded: false, writeHead: vi.fn(),
      write: vi.fn((chunk: string) => { writes.push(chunk); return true; }),
      end: vi.fn(),
    } };
    generator.execute.mockImplementationOnce(async (
      _input: unknown, _teams: unknown, _source: unknown, notify: (text: string) => void,
    ) => { notify('Revisando perfiles y capacidad.'); return proposal; });
    generator.generateEdt.mockImplementationOnce(async (
      _input: unknown, _proposal: unknown, _teams: unknown, _source: unknown,
      notify: (text: string) => void,
    ) => { notify('Construyendo actividades y HH.'); return edt; });
    await controller.createAiPocStream(projectId, input, actor as never, reply as never);
    expect(drafts.authorizeAiPoc).toHaveBeenCalledOnce();
    expect(reply.hijack).toHaveBeenCalledOnce();
    expect(reply.raw.writeHead).toHaveBeenCalledWith(200,
      expect.objectContaining({ 'Content-Type': 'text/event-stream; charset=utf-8' }));
    expect(writes.join('')).toContain('Revisando perfiles y capacidad.');
    expect(writes.join('')).toContain('Construyendo actividades y HH.');
    expect(writes.filter((s) => s.includes('event: thought'))).toHaveLength(2);
    expect(writes.filter((s) => s.includes('event: phase'))).toHaveLength(3);
    const activities = writes.filter((s) => s.includes('event: activity'));
    expect(activities.length).toBeGreaterThanOrEqual(5);
    expect(activities.join('')).toContain('Respuestas y aclaraciones del cuestionario validadas.');
    expect(activities.join('')).toContain('Equipos activos disponibles: 1');
    expect(activities.join('')).toContain('Conciliación de perfiles y HH completada.');
    expect(activities.join('')).toContain('Cotización guardada correctamente.');
    expect(writes.filter((s) => s.includes('event: complete'))).toHaveLength(1);
    expect(drafts.createAiPocDraft).toHaveBeenCalledOnce();
    expect(reply.raw.end).toHaveBeenCalledOnce();
  });

  it('stream deniega proyectos ajenos antes de abrir el canal o gastar IA', async () => {
    const { controller, drafts, generator } = setup();
    const reply = { hijack: vi.fn(), raw: { writeHead: vi.fn(), write: vi.fn() } };
    drafts.authorizeAiPoc.mockRejectedValueOnce(new BadRequestException('Proyecto sin autorización'));
    await expect(controller.createAiPocStream(projectId, input, actor as never, reply as never))
      .rejects.toThrow('Proyecto sin autorización');
    expect(reply.hijack).not.toHaveBeenCalled();
    expect(generator.execute).not.toHaveBeenCalled();
  });

  it('stream comunica errores sin emitir complete ni crear borrador inválido', async () => {
    const { controller, drafts, generator } = setup();
    const writes: string[] = [];
    const reply = { hijack: vi.fn(), raw: {
      destroyed: false, writableEnded: false, writeHead: vi.fn(),
      write: vi.fn((v: string) => { writes.push(v); return true; }),
      end: vi.fn(),
    } };
    generator.execute.mockRejectedValueOnce(new Error('no-revelar-secretos'));
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    try {
      await controller.createAiPocStream(projectId, input, actor as never, reply as never);
      expect(writes.join('')).toContain('event: error');
      expect(writes.join('')).not.toContain('no-revelar-secretos');
      expect(writes.join('')).toContain('"phase":"proposal"');
      expect(writes.join('')).toMatch(/Código de diagnóstico: [a-f0-9]{8}/);
      expect(writes.join('')).not.toContain('event: complete');
      expect(logged).toHaveBeenCalledWith(expect.stringContaining('"phase":"proposal"'));
      expect(logged.mock.calls[0]![0]).not.toContain('no-revelar-secretos');
    } finally {
      logged.mockRestore();
    }
    expect(drafts.createAiPocDraft).not.toHaveBeenCalled();
  });

  it('reporta fallos de guardado sin exponer detalles y sin invocar OpenAI de nuevo', async () => {
    const { controller, generator, drafts } = setup();
    const writes: string[] = [];
    const reply = { hijack: vi.fn(), raw: {
      destroyed: false, writableEnded: false, writeHead: vi.fn(),
      write: vi.fn((v: string) => { writes.push(v); return true; }),
      end: vi.fn(),
    } };
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    drafts.createAiPocDraft.mockRejectedValueOnce(new Error('password=private-from-db'));
    try {
      await controller.createAiPocStream(projectId, input, actor as never, reply as never);
      expect(generator.execute).toHaveBeenCalledOnce();
      expect(generator.generateEdt).toHaveBeenCalledOnce();
      expect(drafts.createAiPocDraft).toHaveBeenCalledOnce();
      expect(writes.join('')).toContain('"phase":"saving"');
      expect(writes.join('')).toContain('No repitas la generación todavía');
      expect(writes.join('')).not.toContain('password=private-from-db');
      expect(writes.join('')).not.toContain('event: complete');
      expect(logged).toHaveBeenCalledWith(expect.stringContaining('"phase":"saving"'));
      expect(logged.mock.calls[0]![0]).not.toContain('password=private-from-db');
    } finally {
      logged.mockRestore();
    }
  });

  it('crea una versión real solo después de autorización, cuestionario y Gemini', async () => {
    const { controller, drafts, generator } = setup();
    const result = await controller.createAiPoc(projectId, input, actor as never);
    expect(drafts.listActiveQuotationTeams).toHaveBeenCalledWith(projectId, actor);
    expect(generator.execute).toHaveBeenCalledWith(input, catalog, undefined);
    expect(generator.generateEdt).toHaveBeenCalledWith(input, proposal, catalog, undefined);
    expect(generator.reconcileProposalWithEdt).toHaveBeenCalledWith(proposal, edt);
    expect(drafts.createAiPocDraft).toHaveBeenCalledWith(
      projectId, actor, proposal, input.answers, input.dynamicQuestions, edt,
      undefined, { Desarrollo: teamId }, [],
    );
    expect(result).toMatchObject({
      origin: 'ai', status: 'draft', aiReviewStatus: 'pending',
    });
  });

  it('pasa el entendimiento confirmado a Gemini y lo conserva al crear la versión', async () => {
    const { controller, drafts, generator } = setup();
    const confirmedUnderstanding =
      'El usuario confirmó portal web con integración SAP opcional y sin app nativa.';
    const enriched = { ...input, confirmedUnderstanding };
    await controller.createAiPoc(projectId, enriched, actor as never);
    expect(generator.execute).toHaveBeenCalledWith(enriched, catalog, undefined);
    expect(generator.generateEdt).toHaveBeenCalledWith(enriched, proposal, catalog, undefined);
    expect(drafts.createAiPocDraft).toHaveBeenCalledWith(
      projectId, actor, proposal, input.answers, input.dynamicQuestions,
      edt, confirmedUnderstanding, { Desarrollo: teamId }, [],
    );
  });

  it('admite una carpeta Drive verdadera con autorización OAuth del actor', async () => {
    const { drafts, generator } = setup();
    const oauth = { getAuthorizedAccessToken: vi.fn().mockReturnValue('token-prueba') };
    const controller = new QuotationController(
      drafts as never, generator as never,
      new GetEstimationQuestionnaireDefinitionUseCase(),
      { googleDrive: { enabled: false } } as never, oauth as never,
    );
    const real = { ...input, driveFolderUrl: 'https://drive.google.com/drive/folders/carpeta-real-123' };
    generator.execute.mockResolvedValueOnce({ ...proposal, sourceMode: 'drive' });
    generator.generateEdt.mockResolvedValueOnce({ ...edt, source: 'drive' });
    await controller.createAiPoc(projectId, real, actor as never);
    expect(oauth.getAuthorizedAccessToken).toHaveBeenCalledWith(actor.id, 'carpeta-real-123');
    expect(generator.execute).toHaveBeenCalledWith(real, catalog,
      expect.objectContaining({ readDriveSources: expect.any(Function) }));
    expect(generator.generateEdt).toHaveBeenCalledWith(real,
      expect.objectContaining({ sourceMode: 'drive' }), catalog,
      expect.objectContaining({ readDriveSources: expect.any(Function) }));
  });

  it('expone un catálogo real autorizado para el selector F03 sin consultar equipos inventados', async () => {
    const { controller, drafts } = setup();
    const found = await controller.listActiveTeams(projectId, actor as never);
    expect(found).toEqual(catalog);
    expect(drafts.listActiveQuotationTeams).toHaveBeenCalledWith(projectId, actor);
  });

  it('F03 específico restringe propuesta y EDT a los equipos activos seleccionados', async () => {
    const { controller, drafts, generator } = setup();
    const qaId = '0777e456-fd76-445e-83f1-afc25061c125';
    drafts.listActiveQuotationTeams.mockResolvedValueOnce([
      ...catalog, { teamId: qaId, name: 'QA', isActive: true },
    ]);
    const selection = {
      ...input,
      answers: input.answers.map((answer) => answer.questionId === 'F03'
        ? { ...answer, value: 'specific_profiles' } : answer),
      selectedTeamIds: [teamId],
    };
    await controller.createAiPoc(projectId, selection, actor as never);
    expect(generator.execute).toHaveBeenCalledWith(selection, catalog, undefined);
    expect(generator.generateEdt).toHaveBeenCalledWith(selection, proposal, catalog, undefined);
    expect(drafts.createAiPocDraft).toHaveBeenCalledWith(
      projectId, actor, proposal, selection.answers, selection.dynamicQuestions,
      edt, undefined, { Desarrollo: teamId }, [teamId],
    );
  });

  it('rechaza equipos inactivos, ajenos y ausencia de selección ANTES de llamar IA', async () => {
    const selection = (ids: string[]) => ({
      ...input,
      selectedTeamIds: ids,
      answers: input.answers.map((answer) => answer.questionId === 'F03'
        ? { ...answer, value: 'specific_profiles' } : answer),
    });
    for (const ids of [[], [actor.id]]) {
      const { controller, generator } = setup();
      await expect(controller.createAiPoc(projectId, selection(ids), actor as never))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(generator.execute).not.toHaveBeenCalled();
    }
    const { controller, generator } = setup();
    await expect(controller.createAiPoc(projectId, { ...input, selectedTeamIds: [teamId] },
      actor as never)).rejects.toThrow(/solo se permiten si F03/);
    expect(generator.execute).not.toHaveBeenCalled();
  });

  it('impide selección solo QA cuando falta equipo compatible con supervisión TL', async () => {
    const { controller, drafts, generator } = setup();
    const qaId = '0777e456-fd76-445e-83f1-afc25061c125';
    drafts.listActiveQuotationTeams.mockResolvedValueOnce([
      ...catalog, { teamId: qaId, name: 'QA', isActive: true },
    ]);
    await expect(controller.createAiPoc(projectId, {
      ...input, selectedTeamIds: [qaId],
      answers: input.answers.map((answer) => answer.questionId === 'F03'
        ? { ...answer, value: 'specific_profiles' } : answer),
    }, actor as never)).rejects.toThrow(/supervisión obligatoria/);
    expect(generator.execute).not.toHaveBeenCalled();
  });

  it('no gasta solicitudes Gemini si no existe autorización para carpeta real', async () => {
    const { drafts, generator } = setup();
    const controller = new QuotationController(
      drafts as never, generator as never,
      new GetEstimationQuestionnaireDefinitionUseCase(),
      { googleDrive: { enabled: false } } as never,
      { getAuthorizedAccessToken: vi.fn().mockReturnValue(null) } as never,
    );
    await expect(controller.createAiPoc(projectId, {
      ...input, driveFolderUrl: 'https://drive.google.com/drive/folders/carpeta-real-123',
    }, actor as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(generator.execute).not.toHaveBeenCalled();
  });

  it('no llama al modelo cuando cambia proyecto, URL o falta una respuesta fija', async () => {
    const { controller, generator, drafts } = setup();
    await expect(controller.createAiPoc(
      projectId, { ...input, projectId: actor.id }, actor as never,
    )).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.createAiPoc(
      projectId, { ...input, driveFolderUrl: 'https://drive.google.com/drive/folders/externa' },
      actor as never,
    )).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.createAiPoc(
      projectId, { ...input, answers: input.answers.slice(1) }, actor as never,
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(generator.execute).not.toHaveBeenCalled();
    expect(generator.generateEdt).not.toHaveBeenCalled();
    expect(drafts.createAiPocDraft).not.toHaveBeenCalled();
  });

  it('rechaza un proveedor PoC artificial aunque se hayan respondido las preguntas', async () => {
    const { controller, generator, drafts } = setup();
    generator.execute.mockResolvedValueOnce({ ...proposal, provider: 'poc-ai' });
    await expect(controller.createAiPoc(projectId, input, actor as never))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(drafts.createAiPocDraft).not.toHaveBeenCalled();
    expect(generator.generateEdt).not.toHaveBeenCalled();
  });

  it('no crea una versión si Gemini propone un equipo inexistente', async () => {
    const { controller, drafts, generator } = setup();
    generator.execute.mockResolvedValueOnce({
      ...proposal, roles: [{ ...proposal.roles[0], teamId: actor.id }],
    });
    await expect(controller.createAiPoc(projectId, input, actor as never))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(drafts.createAiPocDraft).not.toHaveBeenCalled();
  });

  it('no consume Gemini si Kora no tiene equipos activos', async () => {
    const { controller, drafts, generator } = setup();
    drafts.listActiveQuotationTeams.mockResolvedValueOnce([]);
    await expect(controller.createAiPoc(projectId, input, actor as never))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(generator.execute).not.toHaveBeenCalled();
  });

  it('rechaza preguntas dinámicas que no documenten su origen KDM', async () => {
    const { controller, generator } = setup();
    await expect(controller.createAiPoc(projectId, {
      ...input,
      dynamicQuestions: [{
        id: 'D01', kind: 'dynamic', category: 'Integraciones',
        question: '¿API SAP?', reason: 'Impacta HH',
        impact: 'high', answerType: 'single_choice',
        options: [{ value: 'yes', label: 'Sí' }],
        required: true, sourceRefs: [],
      }],
    } as never, actor as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(generator.execute).not.toHaveBeenCalled();
  });
});
