import { describe, expect, it } from 'vitest';
import { LanguageToolGrammarChecker } from './languagetool.grammar-checker';

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fetchFn, calls };
}

describe('LanguageToolGrammarChecker', () => {
  it('pide la revisión en español y traduce cada coincidencia', async () => {
    const { fetchFn, calls } = fakeFetch(200, {
      matches: [
        {
          message: 'Si es interrogativo, lleva tilde.',
          offset: 4,
          length: 4,
          replacements: [{ value: 'cómo' }],
          rule: { id: 'ES_INTERROGATIVOS', issueType: 'grammar' },
        },
        {
          message: 'Posible error ortográfico.',
          offset: 0,
          length: 3,
          replacements: [{ value: 'hola' }, { value: 'hoja' }],
          rule: { id: 'MORFOLOGIK_RULE_ES', issueType: 'misspelling' },
        },
      ],
    });

    const issues = await new LanguageToolGrammarChecker('http://lt:8081/', fetchFn).check('hla como estas');

    expect(calls[0]?.url).toBe('http://lt:8081/v2/check');
    const params = new URLSearchParams(String(calls[0]?.init?.body));
    expect(params.get('language')).toBe('es');
    expect(params.get('text')).toBe('hla como estas');
    expect(issues).toEqual([
      { offset: 4, length: 4, message: 'Si es interrogativo, lleva tilde.', replacements: ['cómo'], kind: 'grammar' },
      { offset: 0, length: 3, message: 'Posible error ortográfico.', replacements: ['hola', 'hoja'], kind: 'spelling' },
    ]);
  });

  it('recorta las sugerencias a cinco', async () => {
    const { fetchFn } = fakeFetch(200, {
      matches: [
        {
          message: 'x',
          offset: 0,
          length: 1,
          replacements: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((value) => ({ value })),
          rule: { id: 'R' },
        },
      ],
    });

    const [issue] = await new LanguageToolGrammarChecker('http://lt', fetchFn).check('x');

    expect(issue?.replacements).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('falla si LanguageTool no responde bien', async () => {
    const { fetchFn } = fakeFetch(503, {});

    await expect(new LanguageToolGrammarChecker('http://lt', fetchFn).check('hola')).rejects.toThrow('503');
  });
});
