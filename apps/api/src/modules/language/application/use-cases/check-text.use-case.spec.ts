import { describe, expect, it } from 'vitest';
import type { Logger } from '@kora/core';
import type { GrammarChecker, GrammarIssue } from '../ports/grammar-checker.port';
import { CheckTextUseCase } from './check-text.use-case';

const warnings: string[] = [];
const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: (message) => {
    warnings.push(message);
  },
  error: () => undefined,
  child: () => logger,
};

function checkerReturning(issues: GrammarIssue[]): GrammarChecker & { calls: number } {
  return {
    calls: 0,
    check() {
      this.calls += 1;
      return Promise.resolve(issues);
    },
  };
}

describe('CheckTextUseCase', () => {
  it('devuelve solo los problemas gramaticales: la ortografía la marca el front', async () => {
    const checker = checkerReturning([
      { offset: 0, length: 3, message: 'Ortografía', replacements: ['hola'], kind: 'spelling' },
      { offset: 4, length: 4, message: 'Tilde', replacements: ['cómo'], kind: 'grammar' },
    ]);

    const result = await new CheckTextUseCase(checker, logger).execute({ text: 'hla como estas' });

    expect(result.isOk() && result.value).toEqual({
      issues: [{ offset: 4, length: 4, message: 'Tilde', replacements: ['cómo'] }],
    });
  });

  it('no consulta al corrector por un texto vacío', async () => {
    const checker = checkerReturning([]);

    const result = await new CheckTextUseCase(checker, logger).execute({ text: '   ' });

    expect(result.isOk() && result.value).toEqual({ issues: [] });
    expect(checker.calls).toBe(0);
  });

  it('si el corrector falla, responde sin observaciones y lo deja en el log', async () => {
    const checker: GrammarChecker = { check: () => Promise.reject(new Error('timeout')) };

    const result = await new CheckTextUseCase(checker, logger).execute({ text: 'hola' });

    expect(result.isOk() && result.value).toEqual({ issues: [] });
    expect(warnings).toContain('No se pudo revisar la gramática del texto.');
  });
});
