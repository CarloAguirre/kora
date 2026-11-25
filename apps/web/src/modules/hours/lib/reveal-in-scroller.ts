const MARGIN_PX = 12;

/**
 * Lleva `element` a la vista desplazando SOLO su contenedor con scroll real
 * (`overflow-y: auto|scroll`, p. ej. el cuerpo del modal). `scrollIntoView`
 * también desplaza ancestros con `overflow: hidden` —el `<dialog>` del modal—
 * y deja la cabecera del modal fuera de la vista.
 */
export function revealInScroller(element: HTMLElement | null, align: 'start' | 'nearest' = 'nearest') {
  if (!element) return;
  let scroller = element.parentElement;
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
  if (!scroller) return;
  const box = element.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  let delta = 0;
  if (align === 'start') delta = box.top - view.top - MARGIN_PX;
  else if (box.top < view.top) delta = box.top - view.top - MARGIN_PX;
  else if (box.bottom > view.bottom) delta = Math.min(box.bottom - view.bottom + MARGIN_PX, box.top - view.top - MARGIN_PX);
  if (delta !== 0) scroller.scrollBy?.({ top: delta, behavior: 'smooth' });
}
