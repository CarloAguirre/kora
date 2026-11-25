import { z } from 'zod';

/**
 * Revisión gramatical de texto libre (tildes según el contexto, concordancia,
 * puntuación). La ortografía palabra por palabra la resuelve el front solo,
 * con su diccionario local: esto cubre lo que un diccionario no puede ver,
 * como "como estas" → "cómo estás", donde cada palabra por separado existe.
 */

/** Tope por petición: el textarea más largo de Kora (bitácoras, descripciones) queda muy por debajo. */
export const LANGUAGE_CHECK_MAX_LENGTH = 20_000;

export const languageCheckRequestSchema = z.object({
  text: z.string().max(LANGUAGE_CHECK_MAX_LENGTH, `El texto no puede superar ${LANGUAGE_CHECK_MAX_LENGTH} caracteres.`),
});

export type LanguageCheckRequest = z.infer<typeof languageCheckRequestSchema>;

export const languageIssueSchema = z.object({
  /** Posición en el texto, en unidades UTF-16 (las mismas de `String.prototype.slice`). */
  offset: z.number().int(),
  length: z.number().int(),
  /** Explicación para mostrar, p. ej. "Si es interrogativo, lleva tilde.". */
  message: z.string(),
  /** Correcciones propuestas, de la más a la menos probable. */
  replacements: z.array(z.string()),
});

export type LanguageIssue = z.infer<typeof languageIssueSchema>;

export const languageCheckResultSchema = z.object({
  issues: z.array(languageIssueSchema),
});

export type LanguageCheckResult = z.infer<typeof languageCheckResultSchema>;
