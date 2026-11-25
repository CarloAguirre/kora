import { Controller, Get, Param, Post, Res, StreamableFile } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { CurrentUser, type RequestUser } from '../../shared/presentation/decorators/current-user.decorator';
import { Public } from '../../shared/presentation/decorators/public.decorator';
import { RequirePermissions } from '../../shared/presentation/decorators/require-permissions.decorator';
import { ClientPortalPdfService } from './client-portal-pdf.service';

/**
 * Una ruta protegida descarga el PDF real; la otra genera un enlace firmado
 * para que un destinatario externo pueda descargarlo sin iniciar sesión.
 */
@Controller('portal')
export class ClientPortalPdfController {
  constructor(private readonly pdf: ClientPortalPdfService) {}

  @Get('projects/:project/pdf')
  @RequirePermissions('projects:read_own_client')
  async download(
    @CurrentUser() actor: RequestUser,
    @Param('project') project: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const file = await this.pdf.download(actor, project);
    reply.header('Cache-Control', 'private, no-store');
    return new StreamableFile(file.content, {
      type: 'application/pdf',
      disposition: `attachment; filename="${file.filename}"`,
    });
  }

  @Post('projects/:project/share-pdf')
  @RequirePermissions('projects:read_own_client')
  async share(
    @CurrentUser() actor: RequestUser,
    @Param('project') project: string,
  ): Promise<{ url: string; expiresAt: string }> {
    return this.pdf.createShare(actor, project);
  }

  @Public()
  @Get('shared-pdfs/:token')
  async downloadShared(
    @Param('token') token: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const file = await this.pdf.downloadShared(token);
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
    reply.header('Referrer-Policy', 'no-referrer');
    return new StreamableFile(file.content, {
      type: 'application/pdf',
      disposition: `attachment; filename="${file.filename}"`,
    });
  }
}
