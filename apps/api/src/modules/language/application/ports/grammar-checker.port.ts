/** Un problema detectado en el texto, con su posición en unidades UTF-16. */
export interface GrammarIssue {
  readonly offset: number;
  readonly length: number;
  readonly message: string;
  readonly replacements: readonly string[];
  /**
   * `spelling`: la palabra no existe. El front ya la marca con su diccionario
   * local, así que el caso de uso las descarta para no duplicar.
   */
  readonly kind: 'spelling' | 'grammar';
}

/** Corrector gramatical. Hoy es LanguageTool en servidor propio (ver `infrastructure/`). */
export interface GrammarChecker {
  check(text: string): Promise<GrammarIssue[]>;
}

export const GRAMMAR_CHECKER = Symbol('GrammarChecker');
