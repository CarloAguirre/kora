import { LANGUAGE_CHECK_MAX_LENGTH, type LanguageCheckResult, type LanguageIssue } from '@kora/contracts';
import { apiRequest, tokenStore } from '@/shared/lib/api-client';

/**
 * Revisión gramatical (tildes según el contexto, concordancia, puntuación)
 * contra el LanguageTool propio, vía `POST /language/check`.
 *
 * Complementa al diccionario local, que solo sabe si cada palabra existe: en
 * "como estas" las dos existen, y hace falta el contexto para saber que
 * corresponde "cómo estás".
 */

/** Pausa al escribir tras la que se pide la revisión: antes, el texto todavía está cambiando. */
export const GRAMMAR_CHECK_DELAY_MS = 800;

/** Sin sesión (pantallas de login) no se consulta: la API respondería 401. */
export function canCheckGrammar(text: string): boolean {
  return tokenStore.get() !== null && text.trim() !== '' && text.length <= LANGUAGE_CHECK_MAX_LENGTH;
}

export async function checkGrammar(text: string, signal: AbortSignal): Promise<LanguageIssue[]> {
  const result = await apiRequest<LanguageCheckResult>('/language/check', { method: 'POST', body: { text }, signal });
  return result.issues;
}

/**
 * Ajusta las observaciones de una revisión anterior a un texto que cambió
 * después, para no esperar la próxima respuesta: las que quedan antes del
 * tramo editado siguen igual, las de después se corren lo que creció o
 * achicó el texto, y las que tocan el tramo editado se descartan.
 */
export function rebaseIssues(previousText: string, text: string, issues: readonly LanguageIssue[]): LanguageIssue[] {
  if (previousText === text) return [...issues];

  const maxShared = Math.min(previousText.length, text.length);
  let prefix = 0;
  while (prefix < maxShared && previousText[prefix] === text[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < maxShared - prefix &&
    previousText[previousText.length - 1 - suffix] === text[text.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const editedFrom = prefix;
  const editedUntil = previousText.length - suffix;
  const delta = text.length - previousText.length;

  return issues.flatMap((issue) => {
    const end = issue.offset + issue.length;
    if (end < editedFrom) return [issue];
    if (issue.offset > editedUntil) return [{ ...issue, offset: issue.offset + delta }];
    return [];
  });
}
