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
    getAuthorizedAccessToken: vi.fn().mockReturnValue(null),
    start: vi.fn().mockReturnValue({
      state: 'kora-drive-poc-test',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=kora-drive-poc-test',
    }),
  };
  const config: { googleDriveOauthPocEnabled: boolean; google: { enabled: boolean }; googleDrive: { enabled: boolean } } = {
    googleDriveOauthPocEnabled: true, google: { enabled: true }, googleDrive: { enabled: false },
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
    expect(controller.driveOAuthPocStatus()).toEqual({ enabled: true, serviceAccountEnabled: false });
    config.googleDriveOauthPocEnabled = false;
    expect(controller.driveOAuthPocStatus()).toEqual({ enabled: false, serviceAccountEnabled: false });
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


  it('admite conectar Drive sin URL y vincula la autorización solo al usuario autorizado', async () => {
    const { controller, drafts, driveOAuthPoc } = setup();
    const reply = { header: vi.fn(), setCookie: vi.fn() };
    await controller.startDriveOAuthPoc({ projectId }, actor as never, reply as never);
    expect(drafts.authorizeAiPoc).toHaveBeenCalledWith(projectId, actor);
    expect(driveOAuthPoc.start).toHaveBeenCalledWith(actor.id, 'kora-drive-discovery-session');
    expect(reply.setCookie).toHaveBeenCalledTimes(1);
    driveOAuthPoc.getAuthorizedAccessToken.mockReturnValueOnce('delegated-secret');
    expect(await controller.driveOAuthPocAccess({ projectId }, actor as never, reply as never))
      .toEqual({ authorized: true });
    expect(driveOAuthPoc.getAuthorizedAccessToken)
      .toHaveBeenCalledWith(actor.id, 'kora-drive-discovery-session');
  });

  it('con cuenta corporativa activa deshabilita el consentimiento personal de Drive', async () => {
    const { controller, config, driveOAuthPoc } = setup();
    config.googleDrive.enabled = true;
    const reply = { header: vi.fn(), setCookie: vi.fn() };
    expect(controller.driveOAuthPocStatus()).toEqual({
      enabled: false, serviceAccountEnabled: true,
    });
    expect(await controller.driveOAuthPocAccess({ projectId }, actor as never, reply as never))
      .toEqual({ authorized: false });
    driveOAuthPoc.getAuthorizedAccessToken.mockReturnValue('token-usuario-anterior');
    expect(await controller.driveOAuthPocAccess({ projectId }, actor as never, reply as never))
      .toEqual({ authorized: false });
    expect(driveOAuthPoc.getAuthorizedAccessToken).not.toHaveBeenCalled();
    await expect(controller.startDriveOAuthPoc({ projectId }, actor as never, reply as never))
      .rejects.toThrow('La prueba OAuth de Drive no está habilitada');
    expect(driveOAuthPoc.start).not.toHaveBeenCalled();
    expect(reply.setCookie).not.toHaveBeenCalled();
  });

  it('un proyecto ajeno no puede iniciar búsqueda sin URL', async () => {
    const { controller, drafts, driveOAuthPoc } = setup();
    drafts.authorizeAiPoc.mockRejectedValue(new ForbiddenException('No autorizado'));
    await expect(controller.startDriveOAuthPoc({ projectId }, actor as never,
      { header: vi.fn(), setCookie: vi.fn() } as never)).rejects.toThrow(ForbiddenException);
    expect(driveOAuthPoc.start).not.toHaveBeenCalled();
  });

  it('comprueba autorización por usuario y carpeta sin revelar tokens', async () => {
    const { controller, drafts, driveOAuthPoc } = setup();
    driveOAuthPoc.getAuthorizedAccessToken.mockReturnValueOnce('secret-token');
    const reply = { header: vi.fn() };
    const url = 'https://drive.google.com/drive/folders/carpetaQA123';
    expect(await controller.driveOAuthPocAccess({
      projectId, driveFolderUrl: url,
    }, actor as never, reply as never)).toEqual({ authorized: true });
    expect(drafts.authorizeAiPoc).toHaveBeenCalledWith(projectId, actor);
    expect(driveOAuthPoc.getAuthorizedAccessToken).toHaveBeenCalledWith(actor.id, 'carpetaQA123');
    expect(reply.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(await controller.driveOAuthPocAccess({
      projectId, driveFolderUrl: url,
    }, actor as never, reply as never)).toEqual({ authorized: false });
  });

  it('el explorador de carpetas comprueba el proyecto antes de consultar Google Drive', async () => {
    const { controller, drafts, driveOAuthPoc } = setup();
    drafts.authorizeAiPoc.mockRejectedValueOnce(new ForbiddenException('No autorizado'));
    await expect(controller.browseDriveFolder({
      projectId,
      authorizationFolderUrl: 'https://drive.google.com/drive/folders/original123',
      folderUrl: 'https://drive.google.com/drive/folders/hermana123',
    }, actor as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(driveOAuthPoc.getAuthorizedAccessToken).not.toHaveBeenCalled();
    expect(Reflect.getMetadata(ANY_PERMISSIONS_KEY,
      EstimationController.prototype.browseDriveFolder)).toEqual([
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


  it('transmite resúmenes oficiales y JSON final, sin ejecutar un segundo análisis', async () => {
    const { controller, analyzer, drafts } = setup();
    const writes: string[] = [];
    const reply = {
      hijack: vi.fn(),
      raw: { writeHead: vi.fn(), write: vi.fn((chunk: string) => {
        writes.push(chunk); return true;
      }), end: vi.fn(), destroyed: false, writableEnded: false },
    };
    analyzer.execute.mockImplementationOnce(async (
      _input: unknown, _sources: unknown, onThought: (text: string) => void,
      onProgress: (phase: 'documents' | 'gemini', text: string) => void,
    ) => {
      onProgress('documents', 'Documentación leída: 3 archivos.');
      onProgress('gemini', 'Enviando antecedentes a Gemini.');
      onThought('Revisando los antecedentes del proyecto');
      return { projectId, provider: 'gemini', summary: 'Informe válido' };
    });
    await controller.analyzeStream(request, actor as never, reply as never);
    expect(drafts.authorizeAiPoc).toHaveBeenCalledWith(projectId, actor);
    expect(reply.hijack).toHaveBeenCalledOnce();
    expect(reply.raw.writeHead).toHaveBeenCalledWith(200,
      expect.objectContaining({ 'Content-Type': 'text/event-stream; charset=utf-8',
        'X-Accel-Buffering': 'no' }));
    expect(writes).toHaveLength(5);
    expect(writes[0]).toContain('event: phase');
    expect(writes[0]).toContain('Consultando los documentos autorizados');
    expect(writes[1]).toContain('Documentación leída: 3 archivos');
    expect(writes[2]).toContain('Enviando antecedentes a Gemini');
    expect(writes[3]).toContain('event: thought');
    expect(writes[3]).toContain('Revisando los antecedentes');
    expect(writes[4]).toContain('event: complete');
    expect(writes[4]).toContain('Informe válido');
    expect(analyzer.execute).toHaveBeenCalledOnce();
    expect(reply.raw.end).toHaveBeenCalledOnce();
  });

  it('bloquea SSE de un proyecto ajeno antes de abrirlo o gastar cuota', async () => {
    const { controller, analyzer, drafts } = setup();
    const reply = { hijack: vi.fn(), raw: { write: vi.fn(), writeHead: vi.fn() } };
    drafts.authorizeAiPoc.mockRejectedValueOnce(new ForbiddenException('Sin permisos'));
    await expect(controller.analyzeStream(request, actor as never, reply as never))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(reply.hijack).not.toHaveBeenCalled();
    expect(analyzer.execute).not.toHaveBeenCalled();
    expect(Reflect.getMetadata(ANY_PERMISSIONS_KEY,
      EstimationController.prototype.analyzeStream)).toEqual([
      'projects:manage', 'projects:read_assigned',
    ]);
  });

  it('envía un evento de error y cierra SSE si Gemini falla sin devolver resultado falso', async () => {
    const { controller, analyzer } = setup();
    const writes: string[] = [];
    const reply = { hijack: vi.fn(), raw: {
      destroyed: false, writableEnded: false,
      writeHead: vi.fn(), write: vi.fn((chunk: string) => { writes.push(chunk); return true; }),
      end: vi.fn(),
    } };
    analyzer.execute.mockRejectedValueOnce(new Error('secret-token-should-never-leak'));
    await controller.analyzeStream(request, actor as never, reply as never);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toContain('event: phase');
    expect(writes[1]).toContain('event: error');
    expect(writes[1]).not.toContain('secret-token-should-never-leak');
    expect(reply.raw.end).toHaveBeenCalledOnce();
  });

  it('analiza y consume Gemini solo tras autorizar el proyecto del líder', async () => {
    const { controller, drafts, analyzer } = setup();
    expect(Reflect.getMetadata(ANY_PERMISSIONS_KEY, EstimationController.prototype.analyze))
      .toContain('projects:read_assigned');
    await controller.analyze(request, actor as never);
    expect(drafts.authorizeAiPoc).toHaveBeenCalledWith(projectId, actor);
    expect(analyzer.execute).toHaveBeenCalledWith(request, undefined);
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
