import { BadRequestException } from '@nestjs/common';
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
  it('crea una versión real solo después de autorización, cuestionario y Gemini', async () => {
    const { controller, drafts, generator } = setup();
    const result = await controller.createAiPoc(projectId, input, actor as never);
    expect(drafts.listActiveQuotationTeams).toHaveBeenCalledWith(projectId, actor);
    expect(generator.execute).toHaveBeenCalledWith(input, catalog, undefined);
    expect(generator.generateEdt).toHaveBeenCalledWith(input, proposal, catalog, undefined);
    expect(generator.reconcileProposalWithEdt).toHaveBeenCalledWith(proposal, edt);
    expect(drafts.createAiPocDraft).toHaveBeenCalledWith(
      projectId, actor, proposal, input.answers, input.dynamicQuestions, edt,
      undefined, { Desarrollo: teamId },
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
      edt, confirmedUnderstanding, { Desarrollo: teamId },
    );
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
