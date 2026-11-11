import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull, roles, users, type Database } from '@kora/db';
import { DATABASE } from '../../shared/infrastructure/database/database.module';
import { AppConfigService } from '../../config/app-config.service';
import type { RequestUser } from '../../shared/presentation/decorators/current-user.decorator';
import { ClientPortalService } from './client-portal.service';
import { renderClientPortalPdf } from './client-portal-pdf.renderer';

type PortalActor = Pick<RequestUser, 'id' | 'email' | 'role'>;
type ShareClaims = { v: 1; sub: string; project: string; exp: number; nonce: string };
const PDF_SHARE_TTL_SECONDS = 48 * 3600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Enlaces de descarga por capacidad: 256 bits de aleatoriedad + HMAC-SHA256.
 * Caducan en 48 h y dejan de funcionar si el usuario o su grant se revocan.
 * No se publican tokens JWT de sesión ni se agrega autenticación en query.
 */
@Injectable()
export class ClientPortalPdfService {
  constructor(
    private readonly portal: ClientPortalService,
    private readonly config: AppConfigService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  private signature(payload: string): Buffer {
    // Separación criptográfica respecto del uso habitual de refresh tokens.
    const key = createHmac('sha256', this.config.auth.refreshSecret)
      .update('kora-client-portal-pdf-share-v1').digest();
    return createHmac('sha256', key).update(payload).digest();
  }

  private parse(token: string): ShareClaims {
    if (token.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
      throw new NotFoundException('El enlace al PDF no existe o ha caducado.');
    const [payload, mac] = token.split('.');
    const supplied = Buffer.from(mac!, 'base64url');
    const expected = this.signature(payload!);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      throw new NotFoundException('El enlace al PDF no existe o ha caducado.');

    try {
      const claims: unknown = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'));
      if (!claims || typeof claims !== 'object') throw new Error('claims');
      const data = claims as Partial<ShareClaims>;
      if (data.v !== 1 || !UUID.test(data.sub ?? '') || !UUID.test(data.project ?? '') ||
        typeof data.exp !== 'number' || !Number.isInteger(data.exp) ||
        data.exp <= Math.floor(Date.now() / 1000) ||
        data.exp > Math.floor(Date.now() / 1000) + PDF_SHARE_TTL_SECONDS ||
        typeof data.nonce !== 'string' || !/^[A-Za-z0-9_-]{40,48}$/.test(data.nonce)) {
        throw new Error('claims');
      }
      return data as ShareClaims;
    } catch {
      throw new NotFoundException('El enlace al PDF no existe o ha caducado.');
    }
  }

  /** Únicamente tras autorizar al cliente sobre ese proyecto. */
  async createShare(actor: PortalActor, project: string): Promise<{ url: string; expiresAt: string }> {
    const detail = await this.portal.getProject(actor, project);
    const expiresAt = new Date(Date.now() + PDF_SHARE_TTL_SECONDS * 1000);
    const payload = Buffer.from(JSON.stringify({
      v: 1,
      sub: actor.id,
      project: detail.project.id,
      exp: Math.floor(expiresAt.getTime() / 1000),
      nonce: randomBytes(32).toString('base64url'),
    } satisfies ShareClaims)).toString('base64url');
    const signature = this.signature(payload).toString('base64url');
    const prefix = this.config.http.prefix.replace(/^\/+|\/+$/g, '');
    return {
      url: `/${prefix}/portal/shared-pdfs/${payload}.${signature}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async download(actor: PortalActor, project: string): Promise<{ filename: string; content: Buffer }> {
    const detail = await this.portal.getProject(actor, project);
    const filename = this.filename(detail.project.name);
    return { filename, content: renderClientPortalPdf(detail) };
  }

  /**
   * El enlace público NO concede nuevas autorizaciones. Revalida estado de
   * usuario, vínculo empresa y grant del proyecto al descargar el PDF.
   */
  async downloadShared(token: string): Promise<{ filename: string; content: Buffer }> {
    const claims = this.parse(token);
    const [issuer] = await this.db.select({
      id: users.id, email: users.email,
    }).from(users).innerJoin(roles, eq(roles.id, users.roleId))
      .where(and(
        eq(users.id, claims.sub),
        eq(users.status, 'active'),
        isNull(users.deletedAt),
        eq(roles.code, 'cliente'),
      )).limit(1);
    if (!issuer) throw new NotFoundException('El enlace al PDF ya no está disponible.');
    try {
      return await this.download({ id: issuer.id, email: issuer.email, role: 'cliente' }, claims.project);
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof NotFoundException)
        throw new NotFoundException('El enlace al PDF ya no está disponible.');
      throw error;
    }
  }

  private filename(projectName: string): string {
    const normalized = projectName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
    return `Kora-${normalized || 'proyecto'}-seguimiento.pdf`;
  }
}
