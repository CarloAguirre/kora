import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenError, UnauthorizedError } from '@kora/core';
import type { AppConfigService } from '../../../config/app-config.service';
import { ExportApiKeyGuard } from './export-api-key.guard';

const KEY = 'k'.repeat(40);

const guardWith = (apiKey: string | null) =>
  new ExportApiKeyGuard({ exportApi: { apiKey } } as unknown as AppConfigService);

const contextWith = (headers: Record<string, string | string[] | undefined>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as unknown as ExecutionContext;

describe('ExportApiKeyGuard', () => {
  it('deja pasar con la clave correcta', () => {
    expect(guardWith(KEY).canActivate(contextWith({ 'x-api-key': KEY }))).toBe(true);
  });

  it('rechaza sin header', () => {
    expect(() => guardWith(KEY).canActivate(contextWith({}))).toThrow(UnauthorizedError);
  });

  it('rechaza una clave distinta, incluso de otro largo', () => {
    expect(() => guardWith(KEY).canActivate(contextWith({ 'x-api-key': 'otra' }))).toThrow(UnauthorizedError);
    expect(() => guardWith(KEY).canActivate(contextWith({ 'x-api-key': `${KEY}x` }))).toThrow(UnauthorizedError);
  });

  it('queda cerrado si el servidor no tiene clave configurada', () => {
    expect(() => guardWith(null).canActivate(contextWith({ 'x-api-key': KEY }))).toThrow(ForbiddenError);
  });
});
