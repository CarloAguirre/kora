import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull, roles, users, type Database } from '@kora/db';
import { DATABASE } from '../../shared/infrastructure/database/database.module';
import { AppConfigService } from '../../config/app-config.service';
import type { RequestUser } from '../../shared/presentation/decorators/current-user.decorator';
import { ClientPortalService } from './client-portal.service';
import { renderClientPortalPdf } from './client-portal-pdf.renderer';

type PortalActor = Pick<RequestUser, 'id' | 'email' | 'role'>;
type ShareClaims = { sub: string; project: string; exp: number };
const PDF_SHARE_TTL_SECONDS = 48 * 3600;
// Dos UUID (32 B) + expiración (4 B) + nonce aleatorio (16 B) + HMAC-128 (16 B).
// 68 bytes = 91 caracteres base64url: bajo el máximo por defecto (100)
// de Fastify para un parámetro de ruta, sin cambiar la configuración global.
const SHARE_PAYLOAD_BYTES = 52;
const SHARE_MAC_BYTES = 16;
const SHARE_TOKEN_BYTES = SHARE_PAYLOAD_BYTES + SHARE_MAC_BYTES;
const SHARE_TOKEN_LENGTH = 91;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuidFromBytes(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

/**
 * Enlaces de descarga por capacidad: nonce aleatorio de 128 bits + firma
 * HMAC-SHA256 truncada a 128 bits, en un token compacto de 91 caracteres.
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

  private signature(payload: Buffer): Buffer {
    // Clave derivada exclusiva de este caso de uso; nunca usar JWT de sesión.
    const key = createHmac('sha256', this.config.auth.refreshSecret)
      .update('kora-client-portal-pdf-share-v2').digest();
    return createHmac('sha256', key).update(payload).digest().subarray(0, SHARE_MAC_BYTES);
  }

  private parse(token: string): ShareClaims {
    const unavailable = () => new NotFoundException('El enlace al PDF no existe o ha caducado.');
    if (token.length !== SHARE_TOKEN_LENGTH || !/^[A-Za-z0-9_-]+$/.test(token))
      throw unavailable();
    const bytes = Buffer.from(token, 'base64url');
    // Rechazar codificaciones alternativas y longitudes malformadas.
    if (bytes.length !== SHARE_TOKEN_BYTES || bytes.toString('base64url') !== token)
      throw unavailable();
    const payload = bytes.subarray(0, SHARE_PAYLOAD_BYTES);
    const supplied = bytes.subarray(SHARE_PAYLOAD_BYTES);
    if (!timingSafeEqual(supplied, this.signature(payload)))
      throw unavailable();

    const exp = payload.readUInt32BE(32);
    const now = Math.floor(Date.now() / 1000);
    if (exp <= now || exp > now + PDF_SHARE_TTL_SECONDS)
      throw unavailable();

    const sub = uuidFromBytes(payload.subarray(0, 16));
    const project = uuidFromBytes(payload.subarray(16, 32));
    if (!UUID.test(sub) || !UUID.test(project)) throw unavailable();
    return { sub, project, exp };
  }

  /** Únicamente tras autorizar al cliente sobre ese proyecto. */
  async createShare(actor: PortalActor, project: string): Promise<{ url: string; expiresAt: string }> {
    const detail = await this.portal.getProject(actor, project);
    if (!UUID.test(actor.id) || !UUID.test(detail.project.id))
      throw new NotFoundException('No fue posible crear el enlace de descarga.');

    const expiresAt = new Date(Date.now() + PDF_SHARE_TTL_SECONDS * 1000);
    const expires = Buffer.alloc(4);
    expires.writeUInt32BE(Math.floor(expiresAt.getTime() / 1000));
    const payload = Buffer.concat([
      Buffer.from(actor.id.replace(/-/g, ''), 'hex'),
      Buffer.from(detail.project.id.replace(/-/g, ''), 'hex'),
      expires,
      randomBytes(16),
    ]);
    const token = Buffer.concat([payload, this.signature(payload)]).toString('base64url');
    const prefix = this.config.http.prefix.replace(/^\/+|\/+$/g, '');
    return {
      url: '/' + prefix + '/portal/shared-pdfs/' + token,
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
