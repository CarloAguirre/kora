import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SpellcheckController, type SpellcheckMenuRequest } from './controller';
import styles from './SpellcheckLayer.module.css';

/**
 * Corrector ortográfico y gramatical de toda la app. Se monta una sola vez en
 * `App` y desde ahí revisa cualquier campo de texto en que se escriba (ver
 * `controller.ts`); los formularios no tienen que hacer nada para tenerlo.
 *
 * Lo único que dibuja con React es el menú que se abre al hacer clic sobre
 * una marca: las correcciones posibles, "Agregar al diccionario" (solo
 * ortografía) e "Ignorar".
 */
export function SpellcheckLayer() {
  const [menu, setMenu] = useState<SpellcheckMenuRequest | null>(null);

  useEffect(() => {
    const controller = new SpellcheckController(
      {
        box: styles.box ?? '',
        mirror: styles.mirror ?? '',
        spelling: styles.spelling ?? '',
        grammar: styles.grammar ?? '',
      },
      setMenu,
    );
    controller.start();
    return () => controller.stop();
  }, []);

  if (!menu) return null;
  return createPortal(<SuggestionsMenu menu={menu} onClose={() => setMenu(null)} />, menu.container);
}

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 4;

function SuggestionsMenu({ menu, onClose }: { menu: SpellcheckMenuRequest; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  // Se pinta primero oculto para medirlo y se ubica bajo la marca (o encima,
  // si no cabe) antes de mostrarse, como `DropdownMenu`.
  useLayoutEffect(() => {
    const panel = panelRef.current?.getBoundingClientRect();
    if (!panel) return;
    const { anchor } = menu;
    const fitsBelow = anchor.bottom + ANCHOR_GAP + panel.height <= window.innerHeight - VIEWPORT_MARGIN;
    setPosition({
      left: Math.max(VIEWPORT_MARGIN, Math.min(anchor.left, window.innerWidth - VIEWPORT_MARGIN - panel.width)),
      top: fitsBelow
        ? anchor.bottom + ANCHOR_GAP
        : Math.max(VIEWPORT_MARGIN, anchor.top - ANCHOR_GAP - panel.height),
    });
  }, [menu]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    // Seguir escribiendo descarta el menú, como el del corrector nativo.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Que el Escape no cierre además el modal donde está el campo.
        event.preventDefault();
        event.stopPropagation();
      }
      onClose();
    };
    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const { addToDictionary } = menu;
  const run = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <div
      ref={panelRef}
      className={styles.panel}
      role="menu"
      aria-label={`Corrección de "${menu.text}"`}
      style={position ?? { left: menu.anchor.left, top: menu.anchor.bottom, visibility: 'hidden' }}
      // Sin esto, el clic le quita el foco al campo antes de corregirlo (y un
      // campo que guarda al perder el foco guardaría el texto sin corregir).
      onMouseDown={(event) => event.preventDefault()}
    >
      {menu.message && <p className={styles.message}>{menu.message}</p>}
      {menu.suggestions.length > 0 ? (
        menu.suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            role="menuitem"
            className={[styles.item, styles.suggestion].join(' ')}
            onClick={() => run(() => menu.replace(suggestion))}
          >
            {suggestion}
          </button>
        ))
      ) : (
        <span className={styles.empty}>Sin sugerencias</span>
      )}
      <hr className={styles.divider} />
      {addToDictionary && (
        <button type="button" role="menuitem" className={styles.item} onClick={() => run(addToDictionary)}>
          Agregar al diccionario
        </button>
      )}
      <button type="button" role="menuitem" className={styles.item} onClick={() => run(menu.ignore)}>
        Ignorar
      </button>
    </div>
  );
}
