import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

/**
 * Acceso tipado a la configuración, agrupado por área.
 *
 * El resto de la aplicación depende de estos objetos pequeños y no del
 * `ConfigService` genérico: así un servicio de autenticación declara que
 * necesita `authConfig` y no queda acoplado a todo el entorno (ISP).
 */

export interface DatabaseSettings {
  readonly url: string;
  readonly poolSize: number;
  readonly ssl: boolean;
}

export interface AuthSettings {
  readonly accessSecret: string;
  readonly refreshSecret: string;
  readonly accessTtlSeconds: number;
  readonly refreshTtlDays: number;
  readonly allowedEmailDomains: readonly string[];
  readonly maxFailedAttempts: number;
  readonly lockMinutes: number;
}

export interface HttpSettings {
  readonly port: number;
  readonly prefix: string;
  readonly corsOrigins: readonly string[];
}

export interface HourReminderSettings {
  /** Si las tareas programadas de recordatorios de horas corren (la ejecución manual desde la API no depende de esto). */
  readonly enabled: boolean;
}

export interface GoogleOAuthSettings {
  /** `false` si falta cualquiera de las tres variables — el login con Google se apaga, no rompe el arranque. */
  readonly enabled: boolean;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly callbackUrl: string;
}

export interface GoogleDriveSettings {
  readonly enabled: boolean;
  readonly clientEmail: string;
  readonly privateKey: string;
}

export interface MailSettings {
  /** `false` sin `RESEND_API_KEY`: los correos van al log (solo fuera de producción, ver env.schema). */
  readonly enabled: boolean;
  readonly resendApiKey: string;
  readonly from: string;
  /** Si está definido, todo correo se desvía a este buzón (solo desarrollo). */
  readonly redirectTo: string | null;
  /** URL pública del front, sin barra final. */
  readonly webAppUrl: string;
}

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get isProduction(): boolean {
    return this.config.get('NODE_ENV', { infer: true }) === 'production';
  }

  get isTest(): boolean {
    return this.config.get('NODE_ENV', { infer: true }) === 'test';
  }

  get logLevel(): Env['LOG_LEVEL'] {
    return this.config.get('LOG_LEVEL', { infer: true });
  }

  get http(): HttpSettings {
    return {
      port: this.config.get('PORT', { infer: true }),
      prefix: this.config.get('API_PREFIX', { infer: true }),
      corsOrigins: this.config.get('CORS_ORIGINS', { infer: true }),
    };
  }

  get database(): DatabaseSettings {
    return {
      url: this.config.get('DATABASE_URL', { infer: true }),
      poolSize: this.config.get('DATABASE_POOL_SIZE', { infer: true }),
      ssl: this.config.get('DATABASE_SSL', { infer: true }),
    };
  }

  get google(): GoogleOAuthSettings {
    const clientId = this.config.get('GOOGLE_CLIENT_ID', { infer: true }) ?? '';
    const clientSecret = this.config.get('GOOGLE_CLIENT_SECRET', { infer: true }) ?? '';
    const callbackUrl = this.config.get('GOOGLE_CALLBACK_URL', { infer: true }) ?? '';

    return {
      enabled: clientId !== '' && clientSecret !== '' && callbackUrl !== '',
      clientId,
      clientSecret,
      callbackUrl,
    };
  }

  get googleDrive(): GoogleDriveSettings {
    const clientEmail = this.config.get('GOOGLE_DRIVE_CLIENT_EMAIL', { infer: true }) ?? '';
    const privateKeyRaw = this.config.get('GOOGLE_DRIVE_PRIVATE_KEY', { infer: true }) ?? '';

    return {
      enabled: clientEmail !== '' && privateKeyRaw !== '',
      clientEmail,
      privateKey: privateKeyRaw.replace(/\\n/g, '\n'),
    };
  }

  get mail(): MailSettings {
    const resendApiKey = this.config.get('RESEND_API_KEY', { infer: true }) ?? '';

    return {
      enabled: resendApiKey !== '',
      resendApiKey,
      from: this.config.get('MAIL_FROM', { infer: true }),
      redirectTo: this.config.get('MAIL_REDIRECT_TO', { infer: true }) ?? null,
      webAppUrl: this.config.get('WEB_APP_URL', { infer: true }).replace(/\/+$/, ''),
    };
  }

  get hourReminders(): HourReminderSettings {
    return { enabled: this.config.get('HOUR_REMINDERS_ENABLED', { infer: true }) };
  }

  get auth(): AuthSettings {
    return {
      accessSecret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      refreshSecret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      accessTtlSeconds: this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }),
      refreshTtlDays: this.config.get('JWT_REFRESH_TTL_DAYS', { infer: true }),
      allowedEmailDomains: this.config.get('ALLOWED_EMAIL_DOMAINS', { infer: true }),
      maxFailedAttempts: this.config.get('MAX_FAILED_LOGIN_ATTEMPTS', { infer: true }),
      lockMinutes: this.config.get('ACCOUNT_LOCK_MINUTES', { infer: true }),
    };
  }
}

export const AUTH_SETTINGS = Symbol('AuthSettings');
