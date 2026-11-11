import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { FastifyReply } from 'fastify';
import { IS_PUBLIC_KEY } from '../../shared/presentation/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../../shared/presentation/decorators/require-permissions.decorator';
import { ClientPortalPdfController } from './client-portal-pdf.controller';
import type { ClientPortalPdfService } from './client-portal-pdf.service';
import type { RequestUser } from '../../shared/presentation/decorators/current-user.decorator';

const actor = {
  id: '11111111-1111-4111-8111-111111111111', email: 'cliente@ejemplo.cl', role: 'cliente',
} as RequestUser;
const file = { filename: 'Kora-proyecto-seguimiento.pdf', content: Buffer.from('%PDF-1.4\n%%EOF') };

function setup() {
  const service = {
    download: vi.fn(async () => file),
    createShare: vi.fn(async () => ({ url: '/api/portal/shared-pdfs/firmado', expiresAt: '2026-11-13T10:00:00Z' })),
    downloadShared: vi.fn(async () => file),
  };
  const headers = new Map<string, string>();
  const reply = { header: vi.fn((name: string, value: string) => { headers.set(name, value); }) } as unknown as FastifyReply;
  const controller = new ClientPortalPdfController(service as unknown as ClientPortalPdfService);
  return { service, headers, reply, controller };
}

describe('PDF externo: descarga y permisos', () => {
  it('descarga y comparte solo con permiso para proyectos propios del cliente', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ClientPortalPdfController.prototype.download))
      .toEqual(['projects:read_own_client']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ClientPortalPdfController.prototype.share))
      .toEqual(['projects:read_own_client']);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, ClientPortalPdfController.prototype.downloadShared)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, ClientPortalPdfController.prototype.download)).toBeUndefined();
  });

  it('entrega un PDF real como adjunto descargable, sin cache', async () => {
    const ctx = setup();
    const result = await ctx.controller.download(actor, 'proyecto', ctx.reply);
    expect(ctx.service.download).toHaveBeenCalledExactlyOnceWith(actor, 'proyecto');
    expect(result.getHeaders().type).toBe('application/pdf');
    expect(result.getHeaders().disposition).toContain('attachment;');
    expect(ctx.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('la URL compartida también sirve un PDF adjunto y bloquea indexación', async () => {
    const ctx = setup();
    const result = await ctx.controller.downloadShared('token', ctx.reply);
    expect(ctx.service.downloadShared).toHaveBeenCalledExactlyOnceWith('token');
    expect(result.getHeaders().type).toBe('application/pdf');
    expect(result.getHeaders().disposition).toContain('.pdf');
    expect(ctx.headers.get('Cache-Control')).toBe('no-store');
    expect(ctx.headers.get('X-Robots-Tag')).toContain('noindex');
  });
});
