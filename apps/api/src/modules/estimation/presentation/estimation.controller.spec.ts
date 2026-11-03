import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { GetEstimationQuestionnaireDefinitionUseCase } from '../application/use-cases/get-estimation-questionnaire-definition.use-case';
import { EstimationController } from './estimation.controller';

const projectId = '0777e456-fd76-445e-83f1-afc25061c101';
const actor = { id: '0777e456-fd76-445e-83f1-afc25061c102', permissions: ['projects:read_assigned'] };
const request = { projectId, projectName: 'Proyecto PM', clientName: 'Cliente',
  driveFolderUrl: 'https://drive.google.com/drive/folders/kora-poc-fallback', instructions: null };

function setup() {
  const drafts = { authorizeAiPoc: vi.fn().mockResolvedValue(undefined) };
  const analyzer = { execute: vi.fn().mockResolvedValue({ projectId, provider: 'gemini' }) };
  const generator = { execute: vi.fn().mockResolvedValue({ projectId, provider: 'gemini' }) };
  const resolver = { execute: vi.fn().mockResolvedValue({ projectId }) };
  const controller = new EstimationController(
    new GetEstimationQuestionnaireDefinitionUseCase(),
    analyzer as never, generator as never,
    { execute: vi.fn() } as never,
    resolver as never, { execute: vi.fn() } as never,
    drafts as never,
  );
  return { controller, drafts, analyzer, generator, resolver };
}

describe('EstimationController · líder PM de proyecto asignado', () => {
  it('el cuestionario fijo admite projects:read_assigned y devuelve F01-F05 sin BD', () => {
    const { controller } = setup();
    const allowed = Reflect.getMetadata(
      ANY_PERMISSIONS_KEY, EstimationController.prototype.definition,
    ) as string[];
    expect(allowed).toContain('projects:read_assigned');
    expect(controller.definition().fixedQuestions.map((question) => question.id))
      .toEqual(['F01', 'F02', 'F03', 'F04', 'F05']);
  });

  it('analiza y consume Gemini solo tras autorizar el proyecto del líder', async () => {
    const { controller, drafts, analyzer } = setup();
    expect(Reflect.getMetadata(ANY_PERMISSIONS_KEY, EstimationController.prototype.analyze))
      .toContain('projects:read_assigned');
    await controller.analyze(request, actor as never);
    expect(drafts.authorizeAiPoc).toHaveBeenCalledWith(projectId, actor);
    expect(analyzer.execute).toHaveBeenCalledWith(request);
  });

  it('bloquea análisis de proyecto ajeno antes de gastar tokens Gemini', async () => {
    const { controller, drafts, analyzer, generator } = setup();
    drafts.authorizeAiPoc.mockRejectedValueOnce(new ForbiddenException('No autorizado'));
    await expect(controller.analyze(request, actor as never))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(analyzer.execute).not.toHaveBeenCalled();
    expect(generator.execute).not.toHaveBeenCalled();
  });

  it('protege generación de propuesta y resolución de Drive con el mismo alcance', async () => {
    const { controller, drafts, generator, resolver } = setup();
    await controller.proposal({ ...request, answers: [] }, actor as never);
    await controller.driveResolve({ projectId }, actor as never);
    expect(drafts.authorizeAiPoc).toHaveBeenCalledTimes(2);
    expect(generator.execute).toHaveBeenCalledOnce();
    expect(resolver.execute).toHaveBeenCalledOnce();
    expect(Reflect.getMetadata(PERMISSIONS_KEY,
      EstimationController.prototype.driveInventory)).toEqual(['projects:manage']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY,
      EstimationController.prototype.driveFiles)).toEqual(['projects:manage']);
  });

  it('rechaza generar propuesta contestada de un proyecto ajeno', async () => {
    const { controller, drafts, generator } = setup();
    drafts.authorizeAiPoc.mockRejectedValueOnce(new ForbiddenException('No autorizado'));
    await expect(controller.proposalAnswered({ ...request, answers: [] }, actor as never))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(generator.execute).not.toHaveBeenCalled();
  });
});
