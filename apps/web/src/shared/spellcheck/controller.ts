import type { LanguageIssue } from '@kora/contracts';
import { addToDictionary, ensureSpellchecker, ignoreWord, isCorrect, onDictionaryChange, suggest } from './engine';
import { canCheckGrammar, checkGrammar, GRAMMAR_CHECK_DELAY_MS, rebaseIssues } from './grammar';
import { tokenize, type WordToken } from './tokenize';

/**
 * Engancha el corrector a cualquier campo de texto de la app, sin que cada
 * formulario tenga que hacer nada.
 *
 * Escucha `focusin` en todo el documento: el primer foco en un `<textarea>`,
 * un `<input>` de texto o un elemento `contentEditable` lo empieza a seguir,
 * y desde ahí se revisa mientras siga en la página — igual que el corrector
 * nativo, que tampoco marca un campo que nunca se tocó. Un campo con
 * `spellCheck={false}` (buscadores, RUT, URLs) queda fuera.
 *
 * Marca dos cosas:
 *
 * - Ortografía (rojo): palabras que no existen, con el diccionario local
 *   (`engine.ts`). Al instante y sin red.
 * - Gramática (azul): lo que solo se ve con el contexto, como "como estas" →
 *   "cómo estás", con el LanguageTool propio vía la API (`grammar.ts`). Se
 *   pide tras una pausa al escribir; solo en `<textarea>`/`<input>`.
 *
 * Un clic (o clic derecho) sobre una marca abre el menú con las correcciones.
 *
 * Cómo se dibuja el subrayado:
 *
 * - Un `<textarea>`/`<input>` no deja decorar partes de su texto, así que se
 *   le superpone un "espejo": un `div` con la misma tipografía, el mismo
 *   ancho y el mismo desplazamiento, con el texto transparente y solo las
 *   partes marcadas subrayadas. No intercepta clics
 *   (`pointer-events: none`). Va recortado a lo visible del campo y de sus
 *   contenedores con scroll, para no asomar fuera de un modal al desplazarlo.
 * - Un `contentEditable` sí tiene nodos de texto reales, así que se usa la
 *   API de Custom Highlights de CSS (`::highlight(kora-spelling)`), sin tocar
 *   su DOM.
 *
 * El espejo se monta dentro del `<dialog>` abierto si el campo está en uno:
 * los modales usan `showModal()`, que pinta en la capa superior por encima de
 * cualquier z-index — fuera del diálogo, el subrayado quedaría tapado.
 *
 * La posición y el texto se sincronizan en un ciclo de `requestAnimationFrame`
 * que corre solo mientras haya campos seguidos. Es más simple y más robusto que
 * escuchar cada causa posible de cambio (scroll de cualquier contenedor,
 * animaciones, `reset()` de react-hook-form, que no dispara eventos…), y con
 * un puñado de campos el costo es despreciable.
 */

type TextControl = HTMLTextAreaElement | HTMLInputElement;

/** Un tramo marcado del texto de un campo. */
interface Mark {
  start: number;
  end: number;
  text: string;
  kind: 'spelling' | 'grammar';
  /** Solo gramática: la explicación y las correcciones que propone LanguageTool. */
  message?: string;
  replacements?: string[];
}

interface ControlEntry {
  kind: 'control';
  el: TextControl;
  /** Contenedor recortado a la zona visible del campo. */
  box: HTMLDivElement;
  /** Copia del texto con los tramos marcados envueltos en `<span>`. */
  mirror: HTMLDivElement;
  clipAncestors: Element[];
  marks: Mark[];
  markElements: HTMLSpanElement[];
  checkedText: string | null;
  checkedCaret: number | null;
  checkedVersion: number;
  /** Cursor tras la última edición: la palabra donde está se está escribiendo. Un clic lo anula. */
  editCaret: number | null;
  styledSize: string;
  /** Observaciones gramaticales, referidas a `grammarText` (se reubican si el texto cambia). */
  grammarIssues: LanguageIssue[];
  grammarText: string | null;
  grammarTimer: number;
  grammarAbort: AbortController | null;
}

interface EditableMiss {
  range: Range;
  word: string;
}

interface EditableEntry {
  kind: 'editable';
  el: HTMLElement;
  misses: EditableMiss[];
  checkedText: string | null;
  checkedCaret: Node | null;
  checkedOffset: number | null;
  checkedVersion: number;
  editCaret: { node: Node; offset: number } | null;
}

type Entry = ControlEntry | EditableEntry;

export interface SpellcheckMenuRequest {
  /** Rectángulo del tramo marcado: el menú se abre debajo (o encima, si no cabe). */
  anchor: { left: number; top: number; bottom: number };
  kind: 'spelling' | 'grammar';
  /** El texto marcado, para el título accesible. */
  text: string;
  /** Explicación del problema (solo gramática). */
  message: string | null;
  suggestions: string[];
  /** Dónde montar el menú: el `<dialog>` abierto que contiene el campo, o `document.body`. */
  container: HTMLElement;
  replace: (replacement: string) => void;
  ignore: () => void;
  /** Solo ortografía. */
  addToDictionary: (() => void) | null;
}

const HIGHLIGHT_NAME = 'kora-spelling';

/** Propiedades que definen dónde cae cada letra; el espejo las copia del campo. */
const MIRRORED_STYLES = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontStretch',
  'fontVariant',
  'fontFeatureSettings',
  'fontKerning',
  'letterSpacing',
  'wordSpacing',
  'textTransform',
  'textIndent',
  'textAlign',
  'tabSize',
  'direction',
  'lineHeight',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'whiteSpace',
  'overflowWrap',
  'wordBreak',
  'hyphens',
] as const;

export class SpellcheckController {
  private readonly entries = new Map<Element, Entry>();
  private frame = 0;
  /** Sube cada vez que cambia lo que hay que marcar (diccionario, ignorados): obliga a revisar todo de nuevo. */
  private version = 0;
  /** Observaciones gramaticales que se pidió ignorar en esta sesión (tramo + explicación). */
  private readonly ignoredGrammar = new Set<string>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly classNames: { box: string; mirror: string; spelling: string; grammar: string },
    private readonly onMenu: (request: SpellcheckMenuRequest) => void,
  ) {}

  start(): void {
    document.addEventListener('focusin', this.handleFocusIn, true);
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('contextmenu', this.handleContextMenu, true);
    this.unsubscribe = onDictionaryChange(() => this.invalidate());
    if (document.activeElement) this.track(document.activeElement);
  }

  stop(): void {
    document.removeEventListener('focusin', this.handleFocusIn, true);
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('contextmenu', this.handleContextMenu, true);
    this.unsubscribe?.();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const entry of [...this.entries.values()]) this.untrack(entry);
  }

  private invalidate() {
    this.version += 1;
    this.schedule();
  }

  private handleFocusIn = (event: FocusEvent) => {
    if (event.target instanceof Element) this.track(event.target);
  };

  private track(target: Element) {
    const el = target instanceof HTMLElement && target.isContentEditable ? editableRoot(target) : target;
    if (this.entries.has(el) || !isCheckable(el)) return;
    ensureSpellchecker();

    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const box = document.createElement('div');
      box.className = this.classNames.box;
      box.setAttribute('aria-hidden', 'true');
      box.style.display = 'none';
      const mirror = document.createElement('div');
      mirror.className = this.classNames.mirror;
      box.append(mirror);
      box.style.zIndex = stackingZIndex(el);
      mountNextTo(el, box);
      this.entries.set(el, {
        kind: 'control',
        el,
        box,
        mirror,
        clipAncestors: clippingAncestors(el),
        marks: [],
        markElements: [],
        checkedText: null,
        checkedCaret: null,
        checkedVersion: -1,
        editCaret: null,
        styledSize: '',
        grammarIssues: [],
        grammarText: null,
        grammarTimer: 0,
        grammarAbort: null,
      });
    } else if (el instanceof HTMLElement && supportsHighlights()) {
      this.entries.set(el, {
        kind: 'editable',
        el,
        misses: [],
        checkedText: null,
        checkedCaret: null,
        checkedOffset: null,
        checkedVersion: -1,
        editCaret: null,
      });
    }
    this.schedule();
  }

  private untrack(entry: Entry) {
    this.entries.delete(entry.el);
    if (entry.kind === 'control') {
      entry.box.remove();
      window.clearTimeout(entry.grammarTimer);
      entry.grammarAbort?.abort();
    } else if (entry.misses.length > 0) {
      this.updateHighlights();
    }
  }

  private schedule() {
    if (!this.frame && this.entries.size > 0) this.frame = requestAnimationFrame(this.tick);
  }

  private tick = () => {
    this.frame = 0;
    // Un error en un campo (un caso raro de su DOM) no puede cortar el ciclo:
    // sin el `finally`, el corrector dejaría de marcar en toda la app hasta
    // recargar la página.
    try {
      this.update();
    } catch (error) {
      console.error('Corrector ortográfico: error al revisar un campo.', error);
    } finally {
      this.schedule();
    }
  };

  private update() {
    let highlightsChanged = false;

    for (const entry of [...this.entries.values()]) {
      if (!entry.el.isConnected) {
        this.untrack(entry);
        continue;
      }
      try {
        if (entry.kind === 'control') this.checkControl(entry);
        else highlightsChanged = this.checkEditable(entry) || highlightsChanged;
      } catch (error) {
        // Se deja de seguir solo ese campo; el resto sigue revisándose.
        console.error('Corrector ortográfico: se deja de revisar un campo por un error.', error);
        this.untrack(entry);
      }
    }
    if (highlightsChanged) this.updateHighlights();

    // Primero se mide todo y después se escribe, para no forzar un cálculo de
    // diseño por cada campo.
    const controls = [...this.entries.values()].filter(
      (entry): entry is ControlEntry => entry.kind === 'control' && entry.marks.length > 0,
    );
    const layouts = controls.map((entry) => [entry, measure(entry)] as const);
    for (const [entry, layout] of layouts) applyLayout(entry, layout);
  }

  private checkControl(entry: ControlEntry) {
    const { el } = entry;
    const text = el.value;
    const caret = activeCaret(el);
    if (text === entry.checkedText && caret === entry.checkedCaret && entry.checkedVersion === this.version) return;

    const textChanged = text !== entry.checkedText;
    // Escribir deja el cursor al final de la palabra en curso, que todavía no
    // se marca; mover el cursor sin escribir (un clic sobre una palabra
    // marcada) no la oculta.
    const editCaret = textChanged || caret === entry.editCaret ? caret : null;
    if (textChanged) {
      if (entry.grammarText !== null) entry.grammarIssues = rebaseIssues(entry.grammarText, text, entry.grammarIssues);
      entry.grammarText = text;
      this.scheduleGrammarCheck(entry, text);
    }
    entry.checkedText = text;
    entry.checkedCaret = caret;
    entry.checkedVersion = this.version;
    entry.editCaret = editCaret;

    const marks = el.disabled || el.readOnly ? [] : this.marksFor(entry, text, editCaret);
    if (!textChanged && sameMarks(marks, entry.marks)) return;
    this.renderMirror(entry, text, marks);
  }

  private marksFor(entry: ControlEntry, text: string, editCaret: number | null): Mark[] {
    const spelling: Mark[] = tokenize(text)
      .filter((token) => !isBeingTyped(token, editCaret) && !isCorrect(token.word))
      .map((token) => ({ start: token.start, end: token.end, text: token.word, kind: 'spelling' }));

    const grammar: Mark[] = [];
    for (const issue of entry.grammarIssues) {
      const start = issue.offset;
      const end = issue.offset + issue.length;
      const marked = text.slice(start, end);
      if (end <= start || this.ignoredGrammar.has(grammarKey(marked, issue.message))) continue;
      // Si el tramo coincide con una palabra mal escrita, manda la ortografía:
      // su menú ya ofrece las correcciones de esa palabra.
      if ([...spelling, ...grammar].some((mark) => mark.start < end && start < mark.end)) continue;
      grammar.push({ start, end, text: marked, kind: 'grammar', message: issue.message, replacements: issue.replacements });
    }

    return [...spelling, ...grammar].sort((a, b) => a.start - b.start);
  }

  private renderMirror(entry: ControlEntry, text: string, marks: Mark[]) {
    entry.marks = marks;
    entry.markElements = [];
    entry.mirror.replaceChildren();
    if (marks.length === 0) {
      entry.box.style.display = 'none';
      return;
    }
    let position = 0;
    for (const mark of marks) {
      const span = document.createElement('span');
      span.className = mark.kind === 'spelling' ? this.classNames.spelling : this.classNames.grammar;
      span.textContent = text.slice(mark.start, mark.end);
      entry.mirror.append(text.slice(position, mark.start), span);
      entry.markElements.push(span);
      position = mark.end;
    }
    // El espacio de ancho cero mantiene la última línea si el texto termina en
    // salto de línea, igual que el textarea.
    entry.mirror.append(`${text.slice(position)}​`);
  }

  /**
   * Pide la revisión gramatical tras una pausa al escribir. Cada cambio
   * reinicia la espera y cancela la petición en curso: solo importa la
   * respuesta para el texto que quedó.
   */
  private scheduleGrammarCheck(entry: ControlEntry, text: string) {
    window.clearTimeout(entry.grammarTimer);
    entry.grammarAbort?.abort();
    entry.grammarAbort = null;
    if (!canCheckGrammar(text) || entry.el.disabled || entry.el.readOnly) {
      entry.grammarIssues = [];
      return;
    }
    entry.grammarTimer = window.setTimeout(() => {
      const abort = new AbortController();
      entry.grammarAbort = abort;
      checkGrammar(text, abort.signal)
        .then((issues) => {
          if (abort.signal.aborted || entry.el.value !== text || !this.entries.has(entry.el)) return;
          entry.grammarIssues = issues;
          entry.grammarText = text;
          entry.checkedVersion = -1;
          this.schedule();
        })
        .catch(() => {
          // Cancelada o sin respuesta: queda la ortografía, que no depende de la red.
        });
    }, GRAMMAR_CHECK_DELAY_MS);
  }

  /** Devuelve `true` si cambiaron las palabras marcadas. */
  private checkEditable(entry: EditableEntry): boolean {
    const { el } = entry;
    const text = el.textContent ?? '';
    const selection = document.getSelection();
    const caretNode = selection?.isCollapsed && el.contains(selection.focusNode) ? selection.focusNode : null;
    const caretOffset = caretNode ? (selection?.focusOffset ?? null) : null;
    if (
      text === entry.checkedText &&
      caretNode === entry.checkedCaret &&
      caretOffset === entry.checkedOffset &&
      entry.checkedVersion === this.version
    ) {
      return false;
    }
    const textChanged = text !== entry.checkedText;
    const editCaret =
      caretNode && caretOffset !== null && (textChanged || (entry.editCaret?.node === caretNode && entry.editCaret.offset === caretOffset))
        ? { node: caretNode, offset: caretOffset }
        : null;
    entry.checkedText = text;
    entry.checkedCaret = caretNode;
    entry.checkedOffset = caretOffset;
    entry.checkedVersion = this.version;
    entry.editCaret = editCaret;

    const misses: EditableMiss[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const caret = editCaret?.node === node ? editCaret.offset : null;
      for (const token of tokenize(node.textContent ?? '')) {
        if (isBeingTyped(token, caret) || isCorrect(token.word)) continue;
        const range = new Range();
        range.setStart(node, token.start);
        range.setEnd(node, token.end);
        misses.push({ range, word: token.word });
      }
    }
    // Los `Range` son objetos nuevos en cada revisión: hay que reemplazar los
    // resaltados siempre que haya (o hubiera) alguno.
    const changed = misses.length > 0 || entry.misses.length > 0;
    entry.misses = misses;
    return changed;
  }

  private updateHighlights() {
    if (!supportsHighlights()) return;
    const ranges = [...this.entries.values()].flatMap((entry) =>
      entry.kind === 'editable' ? entry.misses.map((miss) => miss.range) : [],
    );
    if (ranges.length > 0) CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
    else CSS.highlights.delete(HIGHLIGHT_NAME);
  }

  /** Clic sobre una marca: abre el menú, sin impedir que el cursor quede ahí. */
  private handleClick = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const hit = this.hitTest(event);
    if (!hit) return;
    // Con texto seleccionado (doble clic, arrastre) la persona está
    // seleccionando, no pidiendo correcciones.
    if (hit.entry.kind === 'control' ? hit.entry.el.selectionStart !== hit.entry.el.selectionEnd : !document.getSelection()?.isCollapsed) {
      return;
    }
    this.onMenu(hit.request);
  };

  /** Clic derecho sobre una marca: el menú de correcciones en vez del del navegador. */
  private handleContextMenu = (event: MouseEvent) => {
    const hit = this.hitTest(event);
    if (!hit) return;
    event.preventDefault();
    this.onMenu(hit.request);
  };

  private hitTest(event: MouseEvent): { entry: Entry; request: SpellcheckMenuRequest } | null {
    const target = event.target;
    if (!(target instanceof Node)) return null;
    const point = { x: event.clientX, y: event.clientY };

    for (const entry of this.entries.values()) {
      if (!entry.el.contains(target)) continue;
      const container = entry.el.closest<HTMLElement>('dialog[open]') ?? document.body;

      if (entry.kind === 'control') {
        for (const [index, span] of entry.markElements.entries()) {
          const rect = rectContaining(span.getClientRects(), point);
          const mark = entry.marks[index];
          if (!rect || !mark) continue;
          const replace = (replacement: string) => replaceInControl(entry.el, mark, replacement);
          return {
            entry,
            request:
              mark.kind === 'spelling'
                ? this.spellingRequest(mark.text, rect, container, replace)
                : {
                    anchor: rect,
                    kind: 'grammar',
                    text: mark.text,
                    message: mark.message ?? null,
                    suggestions: mark.replacements ?? [],
                    container,
                    replace,
                    ignore: () => {
                      this.ignoredGrammar.add(grammarKey(mark.text, mark.message ?? ''));
                      this.invalidate();
                    },
                    addToDictionary: null,
                  },
          };
        }
        return null;
      }

      for (const miss of entry.misses) {
        const rect = rectContaining(miss.range.getClientRects(), point);
        if (!rect) continue;
        return {
          entry,
          request: this.spellingRequest(miss.word, rect, container, (replacement) =>
            replaceInEditable(entry.el, miss, replacement),
          ),
        };
      }
      return null;
    }
    return null;
  }

  private spellingRequest(
    word: string,
    anchor: DOMRect,
    container: HTMLElement,
    replace: (replacement: string) => void,
  ): SpellcheckMenuRequest {
    return {
      anchor,
      kind: 'spelling',
      text: word,
      message: null,
      suggestions: suggest(word),
      container,
      replace,
      ignore: () => ignoreWord(word),
      addToDictionary: () => addToDictionary(word),
    };
  }
}

function grammarKey(text: string, message: string): string {
  return `${text}\u0000${message}`;
}

function isCheckable(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement) {
    if (el.disabled || el.readOnly) return false;
  } else if (el instanceof HTMLInputElement) {
    // `el.type` normaliza: sin atributo o con un tipo desconocido es "text".
    if (el.type !== 'text' || el.disabled || el.readOnly) return false;
  } else if (!(el instanceof HTMLElement && el.isContentEditable)) {
    return false;
  }
  // El `<html>` lleva `spellcheck="false"` para apagar el corrector nativo
  // (ver index.html); cualquier `spellcheck="false"` más cercano al campo es
  // una exclusión explícita.
  const optOut = el.closest('[spellcheck]');
  return !optOut || optOut === document.documentElement || optOut.getAttribute('spellcheck') !== 'false';
}

/** El elemento con `contenteditable` más externo: el foco puede caer en uno anidado. */
function editableRoot(el: HTMLElement): HTMLElement {
  let root = el;
  while (root.parentElement?.isContentEditable) root = root.parentElement;
  return root;
}

function supportsHighlights(): boolean {
  return typeof Highlight !== 'undefined' && typeof CSS !== 'undefined' && 'highlights' in CSS;
}

/** El espejo va dentro del `<dialog>` abierto que contiene al campo, o al final del `body`. */
function mountNextTo(el: Element, box: HTMLElement) {
  const dialog = el.closest('dialog[open]');
  if (dialog) {
    dialog.append(box);
    return;
  }
  // Justo después del bloque de primer nivel que contiene al campo (`#root`):
  // así los menús y avisos que la app monta después en el `body` le quedan
  // encima, como al propio campo.
  let topLevel: Element = el;
  while (topLevel.parentElement && topLevel.parentElement !== document.body) topLevel = topLevel.parentElement;
  if (topLevel.parentElement === document.body) topLevel.after(box);
  else document.body.append(box);
}

/** El z-index con que se apila el campo: el del ancestro posicionado más externo que tenga uno. */
function stackingZIndex(el: Element): string {
  let zIndex = 'auto';
  for (let node = el.parentElement; node && node !== document.body && node.tagName !== 'DIALOG'; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.position !== 'static' && style.zIndex !== 'auto') zIndex = style.zIndex;
  }
  return zIndex;
}

/** Contenedores que recortan al campo (scroll u `overflow: hidden`), hasta el primero con posición fija. */
function clippingAncestors(el: Element): Element[] {
  const ancestors: Element[] = [];
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') ancestors.push(node);
    // Lo que está por encima de un elemento fijo (un `<dialog>`, por ejemplo) ya no lo recorta.
    if (style.position === 'fixed') break;
  }
  return ancestors;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Layout {
  visible: boolean;
  clip: Rect;
  /** Esquina interior (dentro del borde) del campo, en coordenadas de la ventana. */
  inner: Rect;
  /** Dónde cae realmente el (0, 0) de `position: fixed` del espejo: no es la ventana si un ancestro tiene `transform`. */
  origin: { left: number; top: number };
  scrollLeft: number;
  scrollTop: number;
  size: string;
}

function measure(entry: ControlEntry): Layout {
  const { el, box } = entry;
  const rect = el.getBoundingClientRect();
  const inner = {
    left: rect.left + el.clientLeft,
    top: rect.top + el.clientTop,
    right: rect.left + el.clientLeft + el.clientWidth,
    bottom: rect.top + el.clientTop + el.clientHeight,
  };
  let clip = intersect(inner, { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight });
  for (const ancestor of entry.clipAncestors) {
    const ancestorRect = ancestor.getBoundingClientRect();
    clip = intersect(clip, {
      left: ancestorRect.left + ancestor.clientLeft,
      top: ancestorRect.top + ancestor.clientTop,
      right: ancestorRect.left + ancestor.clientLeft + ancestor.clientWidth,
      bottom: ancestorRect.top + ancestor.clientTop + ancestor.clientHeight,
    });
  }
  const boxRect = box.getBoundingClientRect();
  const visible = rect.width > 0 && clip.right > clip.left && clip.bottom > clip.top;
  return {
    visible,
    clip,
    inner,
    // Oculto no se puede medir: se asume la ventana y, si había un
    // `transform` de por medio, se corrige al cuadro siguiente.
    origin:
      box.style.display === 'none'
        ? { left: 0, top: 0 }
        : { left: boxRect.left - parseFloat(box.style.left), top: boxRect.top - parseFloat(box.style.top) },
    scrollLeft: el.scrollLeft,
    scrollTop: el.scrollTop,
    size: `${el.clientWidth}x${el.clientHeight}`,
  };
}

function applyLayout(entry: ControlEntry, layout: Layout) {
  const { el, box, mirror } = entry;
  if (!layout.visible) {
    box.style.display = 'none';
    return;
  }
  box.style.display = '';
  box.style.left = `${layout.clip.left - layout.origin.left}px`;
  box.style.top = `${layout.clip.top - layout.origin.top}px`;
  box.style.width = `${layout.clip.right - layout.clip.left}px`;
  box.style.height = `${layout.clip.bottom - layout.clip.top}px`;

  if (layout.size !== entry.styledSize) {
    entry.styledSize = layout.size;
    const computed = getComputedStyle(el);
    for (const property of MIRRORED_STYLES) mirror.style[property] = computed[property];
    mirror.style.width = `${el.clientWidth}px`;
    if (el instanceof HTMLInputElement) {
      // Un input es una sola línea centrada en vertical y desplazable en horizontal.
      const contentHeight = el.clientHeight - parseFloat(computed.paddingTop) - parseFloat(computed.paddingBottom);
      mirror.style.whiteSpace = 'pre';
      mirror.style.overflowWrap = 'normal';
      mirror.style.width = 'max-content';
      mirror.style.minWidth = `${el.clientWidth}px`;
      mirror.style.height = `${el.clientHeight}px`;
      mirror.style.lineHeight = `${contentHeight}px`;
    }
  }
  mirror.style.left = `${layout.inner.left - layout.clip.left - layout.scrollLeft}px`;
  mirror.style.top = `${layout.inner.top - layout.clip.top - layout.scrollTop}px`;
}

function intersect(a: Rect, b: Rect): Rect {
  return {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
}

/** El rectángulo (de los de una marca que ocupa varias líneas) donde cayó el clic. El margen de abajo cubre el subrayado. */
function rectContaining(rects: DOMRectList, point: { x: number; y: number }): DOMRect | null {
  return (
    Array.from(rects).find(
      (rect) => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom + 3,
    ) ?? null
  );
}

/** Posición del cursor si el campo tiene el foco y no hay texto seleccionado. */
function activeCaret(el: TextControl): number | null {
  return document.activeElement === el && el.selectionStart === el.selectionEnd ? el.selectionStart : null;
}

/** La palabra donde está el cursor todavía se está escribiendo: no se marca hasta salir de ella. */
function isBeingTyped(token: WordToken, caret: number | null): boolean {
  return caret !== null && caret >= token.start && caret <= token.end;
}

function sameMarks(a: Mark[], b: Mark[]): boolean {
  return (
    a.length === b.length &&
    a.every((mark, index) => mark.start === b[index]?.start && mark.end === b[index]?.end && mark.kind === b[index]?.kind)
  );
}

/**
 * Reemplaza el tramo con `insertText`, que se comporta como si la persona lo
 * hubiera escrito: dispara `input` (react-hook-form y los `onChange`
 * controlados se enteran) y queda en el historial de deshacer (Ctrl+Z).
 */
function replaceInControl(el: TextControl, mark: Mark, replacement: string) {
  if (el.value.slice(mark.start, mark.end) !== mark.text) return;
  el.focus();
  el.setSelectionRange(mark.start, mark.end);
  if (document.execCommand('insertText', false, replacement)) return;

  // Respaldo si el navegador no soporta `insertText` en campos: el setter
  // nativo + un evento `input`, igual que el calendario de `TextField`.
  const setValue = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
  setValue?.call(el, el.value.slice(0, mark.start) + replacement + el.value.slice(mark.end));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  const caret = mark.start + replacement.length;
  el.setSelectionRange(caret, caret);
}

function replaceInEditable(el: HTMLElement, miss: EditableMiss, replacement: string) {
  const selection = document.getSelection();
  if (!selection || miss.range.toString() !== miss.word) return;
  el.focus();
  selection.removeAllRanges();
  selection.addRange(miss.range);
  document.execCommand('insertText', false, replacement);
}
