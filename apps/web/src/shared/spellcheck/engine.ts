import type { Hunspell } from 'hunspell-asm';
import affUrl from './dictionaries/es-CL.aff?url';
import dicUrl from './dictionaries/es-CL.dic?url';
import { GLOSSARY } from './glossary';
import { rankSuggestions } from './tokenize';

/**
 * Motor del corrector ortográfico propio de Kora.
 *
 * Es Hunspell — el mismo motor de LibreOffice y de Chrome — compilado a
 * WebAssembly, con el diccionario de español de Chile de LibreOffice
 * (`./dictionaries`, licencia en `LICENSE-es-CL`). Corre entero en el
 * navegador: no depende de que la persona tenga activado el corrector del
 * navegador ni de un servicio externo, y el texto nunca sale del equipo.
 *
 * Se carga recién la primera vez que alguien entra a un campo de texto (son
 * ~1,6 MB entre motor y diccionario, que el navegador deja en caché). Una vez
 * cargado, revisar una palabra toma microsegundos y es sincrónico; por eso la
 * capa visual (`SpellcheckLayer`) puede revisar en cada cuadro sin demoras.
 *
 * Importa `hunspell-asm` por su build CommonJS: el ESM del paquete hace
 * `import * as nanoid` y luego llama al namespace como función, cosa que
 * ningún bundler moderno permite (falla en tiempo de ejecución).
 */

const PERSONAL_DICTIONARY_KEY = 'kora.spellcheck.personal';

let hunspell: Hunspell | null = null;
let loading: Promise<void> | null = null;
const cache = new Map<string, boolean>();
/** Palabras que se pidió ignorar en esta sesión (no se guardan). */
const ignored = new Set<string>();
const listeners = new Set<() => void>();

/** Empieza a cargar el motor si todavía no está cargado. Es seguro llamarlo muchas veces. */
export function ensureSpellchecker(): void {
  if (hunspell || loading) return;
  loading = load()
    .then(() => notify())
    .catch((error: unknown) => {
      // Si falló (p. ej. sin red al bajar el diccionario), se reintenta la
      // próxima vez que alguien entre a un campo.
      console.warn('No se pudo cargar el corrector ortográfico.', error);
    })
    .finally(() => {
      loading = null;
    });
}

async function load(): Promise<void> {
  const [{ loadModule }, aff, dic] = await Promise.all([
    import('hunspell-asm/dist/cjs/index.js'),
    fetchBytes(affUrl),
    fetchBytes(dicUrl),
  ]);
  const factory = await loadModule();
  // El nombre de archivo explícito evita que el paquete use su generador
  // interno de nombres, que es justo el que no funciona empaquetado.
  const instance = factory.create(factory.mountBuffer(aff, 'es-CL.aff'), factory.mountBuffer(dic, 'es-CL.dic'));
  for (const word of [...GLOSSARY, ...readPersonalDictionary()]) instance.addWord(word);
  hunspell = instance;
  cache.clear();
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} al bajar ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

export function isSpellcheckerReady(): boolean {
  return hunspell !== null;
}

/** `true` si la palabra está bien escrita — o si el motor todavía no cargó: mejor no marcar que marcar mal. */
export function isCorrect(word: string): boolean {
  if (!hunspell || ignored.has(word)) return true;
  let correct = cache.get(word);
  if (correct === undefined) {
    correct = hunspell.spell(word);
    cache.set(word, correct);
  }
  return correct;
}

export function suggest(word: string): string[] {
  return hunspell ? rankSuggestions(word, hunspell.suggest(word)) : [];
}

/** Agrega la palabra al diccionario personal (queda guardado en este navegador). */
export function addToDictionary(word: string): void {
  const personal = readPersonalDictionary();
  if (!personal.includes(word)) {
    try {
      localStorage.setItem(PERSONAL_DICTIONARY_KEY, JSON.stringify([...personal, word]));
    } catch {
      // Sin almacenamiento (modo privado, cuota llena): vale solo para esta sesión.
    }
  }
  hunspell?.addWord(word);
  cache.delete(word);
  notify();
}

/** Deja de marcar la palabra hasta que se recargue la página. */
export function ignoreWord(word: string): void {
  ignored.add(word);
  notify();
}

/** Avisa cada vez que cambia el resultado de revisar alguna palabra (motor recién cargado, palabra agregada…). */
export function onDictionaryChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

function readPersonalDictionary(): string[] {
  try {
    const raw = localStorage.getItem(PERSONAL_DICTIONARY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((word): word is string => typeof word === 'string') : [];
  } catch {
    return [];
  }
}
