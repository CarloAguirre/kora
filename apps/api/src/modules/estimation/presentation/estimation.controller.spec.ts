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
  const driveOAuthPoc = {
    start: vi.fn().mockReturnValue({
      state: 'kora-drive-poc-test',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=kora-drive-poc-test',
    }),
  };
  const config: { googleDriveOauthPocEnabled: boolean; google: { enabled: boolean } } = {
    googleDriveOauthPocEnabled: true, google: { enabled: true },
  };
  const controller = new EstimationController(
    new GetEstimationQuestionnaireDefinitionUseCase(),
    analyzer as never, generator as never,
    { execute: vi.fn() } as never,
    resolver as never, { execute: vi.fn() } as never,
    drafts as never, driveOAuthPoc as never, config as never,
  );
  return { controller, drafts, analyzer, generator, resolver, driveOAuthPoc, config };
}

describe('EstimationController · líder PM de proyecto asignado', () => {

  it('expone solo estado de habilitación sin datos sensibles', () => {
    const { controller, config } = setup();
    expect(controller.driveOAuthPocStatus()).toEqual({ enabled: true });
    config.googleDriveOauthPocEnabled = false;
    expect(controller.driveOAuthPocStatus()).toEqual({ enabled: false });
  });

  it('solo inicia la PoC tras verificar permiso comercial del proyecto y coloca cookie httpOnly', async () => {
    const { controller, drafts, driveOAuthPoc } = setup();
    const reply = { header: vi.fn(), setCookie: vi.fn() };
    const result = await controller.startDriveOAuthPoc({
      projectId, driveFolderUrl: 'https://drive.google.com/drive/folders/abc123xyz',
    }, actor as never, reply as never);
    expect(drafts.authorizeAiPoc).toHaveBeenCalledWith(projectId, actor);
    expect(driveOAuthPoc.start).toHaveBeenCalledWith(actor.id, 'abc123xyz');
    expect(result.authorizationUrl).toContain('accounts.google.com');
    expect(reply.setCookie).toHaveBeenCalledWith('kora_drive_poc_state',
      'kora-drive-poc-test', expect.objectContaining({
        httpOnly: true, sameSite: 'lax', maxAge: 300,
      }));
  });

  it('si el proyecto es ajeno no emite consentimiento ni cookie de OAuth', async () => {
    const { controller, drafts, driveOAuthPoc } = setup();
    const reply = { header: vi.fn(), setCookie: vi.fn() };
    drafts.authorizeAiPoc.mockRejectedValueOnce(new ForbiddenException('No autorizado'));
    await expect(controller.startDriveOAuthPoc({
      projectId, driveFolderUrl: 'https://drive.google.com/drive/folders/abc123xyz',
    }, actor as never, reply as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(driveOAuthPoc.start).not.toHaveBeenCalled();
    expect(reply.setCookie).not.toHaveBeenCalled();
  });

  it('rechaza carpetas ficticias de demo y el permiso está acotado a cotizaciones', async () => {
    const { controller, driveOAuthPoc } = setup();
    await expect(controller.startDriveOAuthPoc({
      projectId, driveFolderUrl: 'https://drive.google.com/drive/folders/kora-poc-fallback',
    }, actor as never, {} as never)).rejects.toThrow();
    expect(driveOAuthPoc.start).not.toHaveBeenCalled();
    expect(Reflect.getMetadata(ANY_PERMISSIONS_KEY,
      EstimationController.prototype.startDriveOAuthPoc)).toEqual([
        'projects:manage', 'projects:read_assigned',
      ]);
  });

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
    await controller.driveResolve({ projectId, projectName: 'Proyecto PM' }, actor as never);
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
