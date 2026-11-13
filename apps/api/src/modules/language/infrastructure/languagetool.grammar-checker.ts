import type { GrammarChecker, GrammarIssue } from '../application/ports/grammar-checker.port';

/** Lo que se usa de la respuesta de `POST /v2/check` de LanguageTool. */
interface LanguageToolResponse {
  matches: {
    message: string;
    offset: number;
    length: number;
    replacements: { value: string }[];
    rule: { id: string; issueType?: string };
  }[];
}

/** Más sugerencias no caben en el menú y las últimas casi nunca son las buenas. */
const MAX_REPLACEMENTS = 5;

/** Una revisión lenta ya no sirve: el texto cambió y el front pidió otra. */
const TIMEOUT_MS = 8_000;

/**
 * Corrector gramatical sobre un servidor LanguageTool propio
 * (https://languagetool.org, LGPL), en `LANGUAGETOOL_URL`.
 *
 * Es propio y no la API pública a propósito: lo que se revisa son
 * descripciones de horas y bitácoras de clientes, y no debe salir de la
 * infraestructura de Kabeli. Ver `docs/LANGUAGETOOL.md` para levantarlo.
 */
export class LanguageToolGrammarChecker implements GrammarChecker {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async check(text: string): Promise<GrammarIssue[]> {
    const response = await this.fetchFn(`${this.baseUrl.replace(/\/+$/, '')}/v2/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ text, language: 'es' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`LanguageTool respondió ${response.status}.`);

    const { matches } = (await response.json()) as LanguageToolResponse;
    return matches.map((match) => ({
      offset: match.offset,
      length: match.length,
      message: match.message,
      replacements: match.replacements.slice(0, MAX_REPLACEMENTS).map((replacement) => replacement.value),
      kind: match.rule.issueType === 'misspelling' ? 'spelling' : 'grammar',
    }));
  }
}

/** Sin `LANGUAGETOOL_URL` configurada: no hay revisión gramatical (la ortografía sigue en el front). */
export class DisabledGrammarChecker implements GrammarChecker {
  check(): Promise<GrammarIssue[]> {
    return Promise.resolve([]);
  }
}
