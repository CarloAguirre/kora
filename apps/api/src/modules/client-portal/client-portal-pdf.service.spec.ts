import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { Database } from '@kora/db';
import type { AppConfigService } from '../../config/app-config.service';
import type { ClientPortalService } from './client-portal.service';
import { ClientPortalPdfService } from './client-portal-pdf.service';

const USER = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const actor = { id: USER, email: 'externo@empresa.cl', role: 'cliente' as const };

function setup(issuerExists = true) {
  const portal = {
    getProject: vi.fn(async () => ({ project: { id: PROJECT, name: 'Proyecto A' }, receipts: [] })),
  };
  const config = {
    auth: { refreshSecret: 'secret-for-signed-pdf-links-must-be-strong-and-private' },
    http: { prefix: 'api' },
  } as unknown as AppConfigService;
  type Query = { from(): Query; innerJoin(): Query; where(): Query; limit(num: number): Promise<unknown[]> };
  const query: Query = {
    from: () => query, innerJoin: () => query, where: () => query,
    limit: vi.fn(async () => issuerExists ? [{ id: USER, email: actor.email }] : []),
  };
  const db = { select: vi.fn(() => query) } as unknown as Database;
  const service = new ClientPortalPdfService(portal as unknown as ClientPortalService, config, db);
  return { service, portal, db };
}

describe('ClientPortalPdfService: enlace seguro de descarga', () => {
  it('no copia una URL de la vista, sino un enlace PDF firmado con caducidad', async () => {
    const { service, portal } = setup();
    const link = await service.createShare(actor, PROJECT);
    expect(link.url).toMatch(/^\/api\/portal\/shared-pdfs\/[A-Za-z0-9_-]{91}$/);
    const token = link.url.split('/').at(-1)!;
    // Fastify limita a 100 caracteres el parámetro de ruta; el token
    // anterior superaba ese máximo y provocaba FST_ERR_MAX_PARAM_LENGTH.
    expect(token).toHaveLength(91);
    expect(token.length).toBeLessThanOrEqual(100);
    expect(link.url).not.toContain('/portal/proyectos/');
    expect(new Date(link.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(portal.getProject).toHaveBeenCalledExactlyOnceWith(actor, PROJECT);
  });


  it('descarga con un enlace compacto válido y vuelve a autorizar al emisor', async () => {
    const ctx = setup();
    const link = await ctx.service.createShare(actor, PROJECT);
    const pdf = Buffer.from('%PDF-1.4\\n%%EOF');
    const download = vi.spyOn(ctx.service, 'download').mockResolvedValue({
      filename: 'Kora-proyecto-seguimiento.pdf', content: pdf,
    });
    const result = await ctx.service.downloadShared(link.url.split('/').at(-1)!);
    expect(ctx.db.select).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledExactlyOnceWith(actor, PROJECT);
    expect(result.content).toEqual(pdf);
  });

  it('rechaza automáticamente el enlace cuando pasan las 48 horas', async () => {
    const ctx = setup();
    const link = await ctx.service.createShare(actor, PROJECT);
    const now = vi.spyOn(Date, 'now').mockReturnValue(new Date(link.expiresAt).getTime() + 5_000);
    try {
      await expect(ctx.service.downloadShared(link.url.split('/').at(-1)!))
        .rejects.toBeInstanceOf(NotFoundException);
      expect(ctx.db.select).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
    }
  });

  it('rechaza un enlace alterado sin consultar datos del usuario', async () => {
    const ctx = setup();
    const link = await ctx.service.createShare(actor, PROJECT);
    const changed = link.url.split('/').at(-1)!;
    const tampered = (changed.startsWith('A') ? 'B' : 'A') + changed.slice(1);
    await expect(ctx.service.downloadShared(tampered)).rejects.toBeInstanceOf(NotFoundException);
    expect(ctx.db.select).not.toHaveBeenCalled();
  });

  it('impide descargar si el usuario fue deshabilitado o dado de baja', async () => {
    const ctx = setup(false);
    const link = await ctx.service.createShare(actor, PROJECT);
    await expect(ctx.service.downloadShared(link.url.split('/').at(-1)!))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(ctx.portal.getProject).toHaveBeenCalledOnce();
  });

  it('no acepta enlaces que no tengan firma válida', async () => {
    const ctx = setup();
    await expect(ctx.service.downloadShared('no-es-un-token')).rejects.toBeInstanceOf(NotFoundException);
    expect(ctx.db.select).not.toHaveBeenCalled();
  });
});
