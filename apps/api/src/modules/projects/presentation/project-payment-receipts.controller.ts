import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req, Res, StreamableFile } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ValidationError } from '@kora/core';
import { markProjectPaymentMilestonePaidSchema } from '@kora/contracts';
import { CurrentUser, type RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import { RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { readPaymentReceiptAttachmentUpload, readPaymentReceiptUpload } from '../../../shared/presentation/invoice-upload';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import { AttachProjectPaymentReceiptUseCase, GetProjectPaymentReceiptUseCase } from '../application/use-cases/project-payment-receipt.use-cases';
import { MarkProjectPaymentMilestonePaidUseCase } from '../application/use-cases/mark-project-payment-milestone-paid.use-case';

@Controller('projects/:projectId/payment-milestones/:milestoneId')
export class ProjectPaymentReceiptsController {
  constructor(
    private readonly attachReceipt: AttachProjectPaymentReceiptUseCase,
    private readonly getReceipt: GetProjectPaymentReceiptUseCase,
    private readonly markPaid: MarkProjectPaymentMilestonePaidUseCase,
  ) {}

  @Post('paid/upload')
  @RequirePermissions('billing:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async pay(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('milestoneId', new ParseUUIDPipe()) milestoneId: string,
    @Req() request: FastifyRequest,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    const { metadata, attachments } = await readPaymentReceiptUpload(request);
    if (attachments.size !== 1 || !attachments.has(0)) {
      throw new ValidationError('Debes adjuntar el comprobante del pago.', 'PAYMENT_RECEIPT_MISSING');
    }
    const data = markProjectPaymentMilestonePaidSchema.parse(metadata);
    unwrapOrThrow(await this.markPaid.execute({
      projectId, milestoneId, data, receipt: attachments.get(0), actor: { userId: actor.id, email: actor.email },
    }));
  }

  @Post('payment-receipt')
  @RequirePermissions('billing:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async upload(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('milestoneId', new ParseUUIDPipe()) milestoneId: string,
    @Req() request: FastifyRequest,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    const receipt = await readPaymentReceiptAttachmentUpload(request);
    unwrapOrThrow(await this.attachReceipt.execute({
      projectId, milestoneId, receipt, actor: { userId: actor.id, email: actor.email },
    }));
  }

  @Get('payment-receipt')
  @RequirePermissions('billing:read')
  async read(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('milestoneId', new ParseUUIDPipe()) milestoneId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const receipt = unwrapOrThrow(await this.getReceipt.execute({ projectId, milestoneId }));
    reply.header('Cache-Control', 'private, no-store');
    return new StreamableFile(Buffer.from(receipt.content, 'base64'), {
      type: receipt.mimeType,
      disposition: `inline; filename="comprobante"; filename*=UTF-8''${encodeURIComponent(receipt.name)}`,
    });
  }
}
