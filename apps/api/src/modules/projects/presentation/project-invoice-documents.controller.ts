import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req, Res, StreamableFile } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ValidationError } from '@kora/core';
import { issueProjectPaymentMilestoneInvoiceSchema } from '@kora/contracts';
import { CurrentUser, type RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import { RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { readInvoiceAttachmentUpload, readInvoiceUpload } from '../../../shared/presentation/invoice-upload';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import { AttachProjectInvoiceDocumentUseCase, GetProjectInvoiceDocumentUseCase } from '../application/use-cases/project-invoice-document.use-cases';
import { IssueProjectPaymentMilestoneInvoiceUseCase } from '../application/use-cases/issue-project-payment-milestone-invoice.use-case';

@Controller('projects/:projectId/payment-milestones/:milestoneId')
export class ProjectInvoiceDocumentsController {
  constructor(
    private readonly attachDocument: AttachProjectInvoiceDocumentUseCase,
    private readonly getDocument: GetProjectInvoiceDocumentUseCase,
    private readonly issueInvoice: IssueProjectPaymentMilestoneInvoiceUseCase,
  ) {}

  @Post('invoice/upload')
  @RequirePermissions('billing:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async issue(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('milestoneId', new ParseUUIDPipe()) milestoneId: string,
    @Req() request: FastifyRequest,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    const { metadata, attachments } = await readInvoiceUpload(request, 1);
    if (attachments.size !== 1 || !attachments.has(0)) {
      throw new ValidationError('Debes adjuntar el PDF de la factura.', 'INVALID_INVOICE_ATTACHMENT');
    }
    const data = issueProjectPaymentMilestoneInvoiceSchema.parse(metadata);
    unwrapOrThrow(await this.issueInvoice.execute({
      projectId, milestoneId, data, attachment: attachments.get(0), actor: { userId: actor.id, email: actor.email },
    }));
  }

  @Post('attachment')
  @RequirePermissions('billing:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async upload(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('milestoneId', new ParseUUIDPipe()) milestoneId: string,
    @Req() request: FastifyRequest,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    const attachment = await readInvoiceAttachmentUpload(request);
    unwrapOrThrow(await this.attachDocument.execute({
      projectId, milestoneId, attachment, actor: { userId: actor.id, email: actor.email },
    }));
  }

  @Get('attachment')
  @RequirePermissions('billing:read')
  async read(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('milestoneId', new ParseUUIDPipe()) milestoneId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const attachment = unwrapOrThrow(await this.getDocument.execute({ projectId, milestoneId }));
    reply.header('Cache-Control', 'private, no-store');
    return new StreamableFile(Buffer.from(attachment.content, 'base64'), {
      type: 'application/pdf',
      disposition: `inline; filename="factura.pdf"; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
    });
  }
}
