import { Injectable } from '@nestjs/common';
import pino, { type Logger as PinoInstance } from 'pino';
import type { Logger } from '@kora/core';
import { AppConfigService } from '../../../config/app-config.service';

/** Campos que jamás deben aparecer en un log, aunque lleguen por accidente. */
const REDACTED_PATHS = [
  'password',
  'newPassword',
  'currentPassword',
  'confirmPassword',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  '*.password',
  '*.passwordHash',
  '*.token',
  'req.headers.authorization',
  'req.headers.cookie',
];

@Injectable()
export class PinoLogger implements Logger {
  private readonly instance: PinoInstance;

  constructor(config: AppConfigService) {
    this.instance = pino({
      level: config.logLevel,
      redact: { paths: REDACTED_PATHS, censor: '[redactado]' },
      ...(config.isProduction
        ? {}
        : {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
            },
          }),
    });
  }

  private constructFrom(instance: PinoInstance): Logger {
    const child = Object.create(PinoLogger.prototype) as PinoLogger;
    Object.defineProperty(child, 'instance', { value: instance, enumerable: false });
    return child;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.instance.debug(context ?? {}, message);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.instance.info(context ?? {}, message);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.instance.warn(context ?? {}, message);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.instance.error(context ?? {}, message);
  }

  child(bindings: Record<string, unknown>): Logger {
    return this.constructFrom(this.instance.child(bindings));
  }
}
