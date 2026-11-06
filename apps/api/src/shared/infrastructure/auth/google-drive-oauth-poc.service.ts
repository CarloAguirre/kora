import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_URL = 'https://www.googleapis.com/drive/v3/files';
const READ_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const PREFIX = 'kora-drive-poc-';
const TTL_MS = 5 * 60_000;
const MAX_PENDING = 100;
const MAX_DELEGATED = 100;
const MAX_TOKEN_TTL_MS = 45 * 60_000;
const FOLDER_MIME = 'application/vnd.google-apps.folder';

interface PendingAttempt {
  readonly userId: string;
  readonly folderId: string;
  readonly expiresAt: number;
}

export interface DriveOAuthPocResult {
  readonly status: 'ok' | 'error';
  readonly code: string;
  readonly message: string;
  /** Conteo de la PRIMERA página de 20 archivos, no cantidad total de la carpeta. */
  readonly filesInSample?: number;
}

interface TokenReply {
  access_token?: string;
  scope?: string;
  expires_in?: number;
}

@Injectable()
export class GoogleDriveOAuthPocService {
  /** PoC de UN proceso; reiniciar la API invalida intentos aún pendientes. */
  private readonly pending = new Map<string, PendingAttempt>();
  /** Autorizaciones efímeras por usuario+carpeta. Solo en memoria; jamás en cookies/BD/frontend. */
  private readonly delegated = new Map<string, { token: string; expiresAt: number }>();

  constructor(private readonly config: AppConfigService) {}

  start(userId: string, folderId: string): { state: string; authorizationUrl: string } {
    if (!this.config.googleDriveOauthPocEnabled || !this.config.google.enabled) {
      throw new Error('La prueba OAuth Drive está deshabilitada.');
    }
    if (!/^[A-Za-z0-9_-]{5,200}$/.test(folderId)) {
      throw new Error('ID de carpeta inválido.');
    }
    this.expireOldAttempts();
    if (this.pending.size >= MAX_PENDING) throw new Error('Demasiadas autorizaciones simultáneas.');
    const state = PREFIX + randomBytes(32).toString('hex');
    this.pending.set(state, { userId, folderId, expiresAt: Date.now() + TTL_MS });
    const url = new URL(AUTH_URL);
    url.searchParams.set('client_id', this.config.google.clientId);
    // Reutiliza el redirect URI REAL del login; no requiere otro registro en Cloud.
    url.searchParams.set('redirect_uri', this.config.google.callbackUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', `openid email profile ${READ_SCOPE}`);
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'consent select_account');
    // No necesitamos refresh_token: nunca persistimos autorización en esta PoC.
    url.searchParams.set('access_type', 'online');
    return { state, authorizationUrl: url.toString() };
  }

  getAuthorizedAccessToken(userId: string, folderId: string): string | null {
    if (!this.config.googleDriveOauthPocEnabled) return null;
    this.expireOldAttempts();
    return this.delegated.get(`${userId}:${folderId}`)?.token ?? null;
  }

  async finish(input: {
    state: string; stateCookie: string | null;
    code?: string; error?: string;
  }): Promise<DriveOAuthPocResult> {
    // Estado de un solo uso + cookie httpOnly SameSite=Lax para evitar CSRF.
    this.expireOldAttempts();
    const attempt = this.pending.get(input.state);
    this.pending.delete(input.state);
    if (!this.config.googleDriveOauthPocEnabled || !attempt ||
        !input.stateCookie || input.stateCookie !== input.state ||
        attempt.expiresAt < Date.now()) {
      return fail('STATE_EXPIRED', 'Autorización caducada o estado no válido. Reintenta desde Kora.');
    }
    if (input.error) {
      return fail('GOOGLE_CONSENT_DENIED',
        'Google no concedió los permisos solicitados. Revisa el consentimiento y los scopes.');
    }
    if (!input.code) return fail('MISSING_CODE', 'Google no devolvió un código de autorización.');

    try {
      const tokenResponse = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: input.code,
          client_id: this.config.google.clientId,
          client_secret: this.config.google.clientSecret,
          redirect_uri: this.config.google.callbackUrl,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!tokenResponse.ok) {
        return fail('TOKEN_EXCHANGE_FAILED',
          `Google rechazó el intercambio OAuth (HTTP ${tokenResponse.status}).`);
      }
      const tokens = await tokenResponse.json() as TokenReply;
      if (!tokens.access_token) return fail('NO_ACCESS_TOKEN', 'Google no entregó un token de acceso.');
      if (tokens.scope && !tokens.scope.split(' ').includes(READ_SCOPE)) {
        return fail('DRIVE_SCOPE_MISSING', 'Google no concedió el permiso de lectura Drive.');
      }

      const metadata = await fetch(
        `${DRIVE_URL}/${encodeURIComponent(attempt.folderId)}?fields=id%2Cname%2CmimeType&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` },
          signal: AbortSignal.timeout(15_000) },
      );
      if (!metadata.ok) return driveFailure(metadata, 'metadatos');
      const folder = await metadata.json() as { mimeType?: string };
      if (folder.mimeType !== FOLDER_MIME) {
        return fail('NOT_A_FOLDER', 'El enlace no corresponde a una carpeta de Drive.');
      }

      const url = new URL(DRIVE_URL);
      url.searchParams.set('q', `'${attempt.folderId}' in parents and trashed = false`);
      url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType)');
      url.searchParams.set('pageSize', '20');
      url.searchParams.set('supportsAllDrives', 'true');
      url.searchParams.set('includeItemsFromAllDrives', 'true');
      const filesResponse = await fetch(url, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!filesResponse.ok) return driveFailure(filesResponse, 'listado');
      const files = await filesResponse.json() as { files?: unknown[] };
      // Se conserva SOLO en memoria un token corto para leer los antecedentes de esta
      // carpeta durante el asistente. No se expone al navegador ni se obtiene refresh token.
      const usableTtlMs = Math.min(MAX_TOKEN_TTL_MS, Math.max(0, (tokens.expires_in ?? 3600) * 1000 - 60_000));
      if (usableTtlMs > 0) {
        this.expireOldAttempts();
        if (this.delegated.size >= MAX_DELEGATED) {
          const oldest = this.delegated.keys().next().value;
          if (oldest) this.delegated.delete(oldest);
        }
        this.delegated.set(`${attempt.userId}:${attempt.folderId}`, {
          token: tokens.access_token, expiresAt: Date.now() + usableTtlMs,
        });
      }
      return {
        status: 'ok',
        code: 'DRIVE_READ_SUCCESS',
        message: 'Google Drive autorizó la lectura y el backend consultó una carpeta real.',
        filesInSample: Array.isArray(files.files) ? files.files.length : 0,
      };
    } catch {
      // Nunca registrar códigos OAuth, access tokens ni respuestas brutas de Google.
      return fail('GOOGLE_REQUEST_FAILED',
        'Falló la conexión con Google. Comprueba red, credenciales y configuración OAuth.');
    }
  }

  private expireOldAttempts(): void {
    const now = Date.now();
    for (const [state, attempt] of this.pending) {
      if (attempt.expiresAt <= now) this.pending.delete(state);
    }
    for (const [key, grant] of this.delegated) {
      if (grant.expiresAt <= now) this.delegated.delete(key);
    }
  }
}

function fail(code: string, message: string): DriveOAuthPocResult {
  return { status: 'error', code, message };
}

/**
 * Google devuelve HTTP 403 para situaciones muy diferentes. Clasificamos SOLO
 * razones técnicas conocidas y el paso de la consulta. No devolvemos el cuerpo
 * sin filtrar de Google: podría incluir nombres, emails o IDs privados.
 */
async function driveFailure(
  response: Response,
  step: 'metadatos' | 'listado',
): Promise<DriveOAuthPocResult> {
  const status = response.status;
  const raw: unknown = await response.json().catch(() => null);
  const err = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as { error?: unknown }).error
    : null;
  const detail = err && typeof err === 'object' && !Array.isArray(err)
    ? err as {
      status?: unknown;
      message?: unknown;
      errors?: Array<{ reason?: unknown }>;
      details?: Array<{ reason?: unknown }>;
    }
    : null;
  const reasons = [
    ...(Array.isArray(detail?.errors) ? detail.errors.map((item) => item?.reason) : []),
    ...(Array.isArray(detail?.details) ? detail.details.map((item) => item?.reason) : []),
  ].filter((reason): reason is string => typeof reason === 'string')
    .map((reason) => reason.replace(/[^a-z0-9]/gi, '').toLowerCase());
  const reason = new Set(reasons);
  const message = typeof detail?.message === 'string' ? detail.message : '';

  if (status === 403) {
    if (
      ['servicedisabled', 'apidisabled', 'accessnotconfigured'].some((value) => reason.has(value)) ||
      /(?:drive api|google drive api|api has not been used in project).*(?:disabled|not enabled|not been used)|api has not been used in project/i.test(message)
    ) {
      return fail('DRIVE_API_NOT_ENABLED',
        'Google Drive API no está habilitada en el proyecto Google Cloud de estas credenciales. ' +
        'El administrador debe habilitar Google Drive API (drive.googleapis.com) y repetir la prueba.');
    }

    if (['ratelimitexceeded', 'userratelimitexceeded', 'dailylimitexceeded'].some((value) => reason.has(value))) {
      return fail('DRIVE_QUOTA_EXCEEDED',
        'Google Drive rechazó la solicitud por límites de cuota o frecuencia. Comprueba las cuotas de Drive API.');
    }

    if (['insufficientpermissions', 'domainpolicy', 'appnotauthorizedtofile', 'accessdenied',
      'forbidden', 'insufficientfilepermissions', 'permissiondenied'].some((value) => reason.has(value))) {
      return fail('DRIVE_PERMISSION_DENIED',
        `Google Drive rechazó los permisos al consultar ${step}. Revisa el acceso de la cuenta Google a la carpeta y las políticas de Workspace.`);
    }

    return fail('DRIVE_API_DISABLED_OR_FORBIDDEN',
      `Google Drive devolvió HTTP 403 al consultar ${step}. Revisa en Google Cloud que Drive API esté habilitada y que la cuenta tenga permisos.`);
  }

  if (status === 404) return fail('FOLDER_NOT_ACCESSIBLE',
    'Carpeta inexistente o sin permisos para la cuenta Google que autorizó.');
  if (status === 401) return fail('DRIVE_TOKEN_REJECTED',
    'Google Drive rechazó el token de acceso. Vuelve a conceder el consentimiento.');
  return fail('DRIVE_HTTP_ERROR', `Google Drive rechazó ${step} (HTTP ${status}).`);
}

/** Página segura de resultado para el popup: solo diagnóstico, jamás tokens. */
export function renderDriveOAuthPocResult(result: DriveOAuthPocResult): string {
  const safe = JSON.stringify({
    type: 'kora-drive-oauth-poc',
    status: result.status, code: result.code, message: result.message,
    filesInSample: result.filesInSample ?? 0,
  }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const heading = result.status === 'ok' ? 'Lectura de Drive confirmada' : 'Drive no disponible';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Prueba Google Drive · Kora</title>
<style>body{font:16px system-ui,sans-serif;padding:30px;background:#f7f9fc;color:#132237}
section{max-width:540px;padding:24px;background:#fff;border:1px solid #d8e3ed;border-radius:14px}
button{padding:10px 18px;background:#132237;color:#fff;border:0;border-radius:8px;cursor:pointer}
small{color:#475467}</style></head><body><section><h2>${heading}</h2>
<p id="message"></p><small id="code"></small><p><button onclick="window.close()">Cerrar</button></p>
</section><script>const result=${safe};document.querySelector('#message').textContent=result.message;
document.querySelector('#code').textContent=result.code+(result.status==='ok'?' · Archivos en primera página: '+result.filesInSample:'');
if(window.opener)window.opener.postMessage(result,window.location.origin);</script></body></html>`;
}
