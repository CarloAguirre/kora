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
    expect(link.url).toMatch(/^\/api\/portal\/shared-pdfs\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(link.url).not.toContain('/portal/proyectos/');
    expect(new Date(link.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(portal.getProject).toHaveBeenCalledExactlyOnceWith(actor, PROJECT);
  });

  it('rechaza un enlace alterado sin consultar datos del usuario', async () => {
    const ctx = setup();
    const link = await ctx.service.createShare(actor, PROJECT);
    const changed = link.url.split('/').at(-1)!;
    const tampered = changed.slice(0, -1) + (changed.endsWith('X') ? 'Y' : 'X');
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
