import { describe, expect, it } from 'vitest';
import type { LanguageIssue } from '@kora/contracts';
import { rebaseIssues } from './grammar';

const issue = (offset: number, length: number): LanguageIssue => ({ offset, length, message: 'm', replacements: [] });

describe('rebaseIssues', () => {
  // "hla como estas": "como" en 4–8.
  const previous = 'hla como estas';

  it('deja igual lo que queda antes del tramo editado', () => {
    expect(rebaseIssues(previous, `${previous} hoy`, [issue(4, 4)])).toEqual([issue(4, 4)]);
  });

  it('corre lo que queda después del tramo editado', () => {
    expect(rebaseIssues(previous, `hola${previous.slice(3)}`, [issue(4, 4)])).toEqual([issue(5, 4)]);
  });

  it('descarta lo que toca el tramo editado', () => {
    expect(rebaseIssues(previous, 'hla cómo estas', [issue(4, 4)])).toEqual([]);
  });

  it('descarta lo que queda pegado al tramo editado: escribir al borde de una palabra la cambia', () => {
    expect(rebaseIssues(previous, 'hla comox estas', [issue(4, 4)])).toEqual([]);
  });
});
