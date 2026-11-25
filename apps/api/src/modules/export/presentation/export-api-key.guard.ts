import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ForbiddenError, UnauthorizedError } from '@kora/core';
import type { FastifyRequest } from 'fastify';
import { AppConfigService } from '../../../config/app-config.service';

export const EXPORT_API_KEY_HEADER = 'x-api-key';

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/**
 * Protege el export con una API key fija (`EXPORT_API_KEY`) en vez de sesión:
 * lo consumen integraciones máquina a máquina que no pueden renovar un JWT.
 *
 * Se compara el hash SHA-256 de ambas claves con `timingSafeEqual` — mismo
 * largo siempre y sin filtrar por tiempo cuántos caracteres coinciden.
 */
@Injectable()
export class ExportApiKeyGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.exportApi.apiKey;
    if (!expected) {
      throw new ForbiddenError('El export no está habilitado en este servidor.', 'EXPORT_DISABLED');
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const header = request.headers[EXPORT_API_KEY_HEADER];
    const provided = Array.isArray(header) ? header[0] : header;

    if (!provided) {
      throw new UnauthorizedError('Falta la API key (header X-Api-Key).', 'EXPORT_MISSING_API_KEY');
    }
    if (!timingSafeEqual(digest(provided), digest(expected))) {
      throw new UnauthorizedError('La API key es inválida.', 'EXPORT_INVALID_API_KEY');
    }
    return true;
  }
}
