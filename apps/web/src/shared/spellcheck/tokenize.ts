/**
 * Extracción de las palabras de un texto que vale la pena pasar por el
 * corrector, con su posición en el texto original.
 *
 * Deja fuera lo que no es prosa y que el diccionario marcaría siempre como
 * error: URLs, correos, rutas, códigos con dígitos (`HH2`, `2da`), siglas en
 * mayúsculas (`QA`, `KPI`) y nombres con mayúsculas internas (`JavaScript`).
 */

export interface WordToken {
  word: string;
  start: number;
  end: number;
}

/** Letras (con sus tildes combinadas) y apóstrofos internos: `it's`, `d'Artagnan`. */
const WORD = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu;

/** Trozo sin espacios que parece URL, correo, ruta, etiqueta o identificador de código. */
const NOT_PROSE = /[@/\\_#=<>{}[\]|~`$%^*+]|:\/\/|^www\.|[\p{L}\d]\.[\p{L}\d]/u;

const DIGIT = /\d/;
const UPPERCASE = /\p{Lu}/u;

export function tokenize(text: string): WordToken[] {
  const tokens: WordToken[] = [];

  for (const chunk of text.matchAll(/\S+/g)) {
    if (NOT_PROSE.test(chunk[0])) continue;

    for (const match of chunk[0].matchAll(WORD)) {
      const word = match[0];
      const start = chunk.index + match.index;
      const end = start + word.length;

      if (word.length < 2) continue;
      if (DIGIT.test(text[start - 1] ?? '') || DIGIT.test(text[end] ?? '')) continue;
      if (word === word.toLocaleUpperCase('es-CL')) continue;
      if (UPPERCASE.test(word.slice(1))) continue;

      tokens.push({ word, start, end });
    }
  }

  return tokens;
}

/** El texto sin tildes ni mayúsculas: `Diseño` y `diseno` pliegan igual. */
export function foldAccents(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es-CL');
}

/**
 * Ordena y recorta las sugerencias de Hunspell para el menú.
 *
 * Hunspell las devuelve por su propio puntaje, que a veces deja la corrección
 * evidente en cuarto lugar (`diseno` → `disenso`, `disueno`, `diseco`,
 * `diseño`). En español el error más común es la tilde o la eñe que falta, así
 * que primero van las que solo difieren en eso; después el resto en el orden
 * de Hunspell. Las que parten la palabra con guion (`bit-acora`) no aportan y
 * se descartan; las que la parten con espacio (`atodo` → `a todo`) van al
 * final.
 */
export function rankSuggestions(word: string, suggestions: readonly string[], limit = 6): string[] {
  const folded = foldAccents(word);
  const accentOnly: string[] = [];
  const rest: string[] = [];
  const split: string[] = [];

  for (const suggestion of new Set(suggestions)) {
    if (suggestion === word || suggestion.includes('-')) continue;
    if (foldAccents(suggestion) === folded) accentOnly.push(suggestion);
    else if (suggestion.includes(' ')) split.push(suggestion);
    else rest.push(suggestion);
  }

  return [...accentOnly, ...rest, ...split].slice(0, limit);
}
