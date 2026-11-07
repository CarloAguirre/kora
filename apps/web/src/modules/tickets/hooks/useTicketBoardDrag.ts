import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { TicketStatus, TicketSummary } from '@kora/contracts';

export type BoardStatus = Exclude<TicketStatus, 'closed'>;

export interface BoardDragSession {
  ticket: TicketSummary;
  fromStatus: BoardStatus;
  width: number;
  height: number;
  /** Punto de agarre dentro de la tarjeta: la inclinación pivota sobre él. */
  grabX: number;
  grabY: number;
  /** `dropping`: la tarjeta flotante vuela a su lugar nuevo; `cancelling`: vuelve al de origen. */
  phase: 'dragging' | 'dropping' | 'cancelling';
}

const DRAG_THRESHOLD_PX = 6;
const MAX_TILT_DEG = 10;
export const SETTLE_MS = 280;
const EASE_OUT = 'cubic-bezier(0.2, 0.9, 0.3, 1)';

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Posición de inserción de `ticket` en una columna ordenada por `createdAt`
 * desc — el mismo orden que devuelve la API, así el hueco que se muestra al
 * arrastrar coincide con donde queda la tarjeta tras el refetch.
 */
export function insertionIndex(items: TicketSummary[], ticket: TicketSummary) {
  const createdAt = Date.parse(ticket.createdAt);
  const index = items.findIndex((item) => Date.parse(item.createdAt) < createdAt);
  return index === -1 ? items.length : index;
}

/**
 * Arrastre del tablero Kanban con pointer events en vez del drag nativo de
 * HTML5 (cuyo "fantasma" translúcido no se puede animar): una copia flotante
 * de la tarjeta sigue al cursor inclinándose según la velocidad, y al soltar
 * vuela hasta su lugar en la columna destino — o de vuelta al origen si se
 * cancela (Escape, soltar fuera o en la misma columna).
 */
export function useTicketBoardDrag({
  boardRef,
  onDrop,
}: {
  boardRef: RefObject<HTMLElement | null>;
  onDrop: (ticket: TicketSummary, fromStatus: BoardStatus, toStatus: BoardStatus) => void;
}) {
  const [session, setSession] = useState<BoardDragSession | null>(null);
  const [overStatus, setOverStatus] = useState<BoardStatus | null>(null);
  const [settledTicketId, setSettledTicketId] = useState<string | null>(null);

  const columnsRef = useRef(new Map<BoardStatus, HTMLElement>());
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0, grabX: 0, grabY: 0, lastX: 0, tilt: 0, frame: 0, active: false });
  const suppressClickRef = useRef(false);
  const onDropRef = useRef(onDrop);
  useLayoutEffect(() => {
    onDropRef.current = onDrop;
  });

  const applyTransform = (element: HTMLElement) => {
    const p = pointerRef.current;
    element.style.transform = `translate3d(${p.x - p.grabX}px, ${p.y - p.grabY}px, 0) rotate(${p.tilt}deg)`;
  };

  const setOverlayRef = useCallback((element: HTMLDivElement | null) => {
    overlayRef.current = element;
    if (element && pointerRef.current.active) applyTransform(element);
  }, []);

  const registerColumn = useCallback(
    (status: BoardStatus) => (element: HTMLElement | null) => {
      if (element) columnsRef.current.set(status, element);
      else columnsRef.current.delete(status);
    },
    [],
  );

  const columnAt = (x: number, y: number): BoardStatus | null => {
    for (const [status, element] of columnsRef.current) {
      const rect = element.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return status;
    }
    return null;
  };

  const handleCardPointerDown = (event: React.PointerEvent<HTMLElement>, ticket: TicketSummary, status: BoardStatus) => {
    if (event.button !== 0 || session) return;
    const card = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const p = pointerRef.current;
    let started = false;

    const tick = () => {
      // La inclinación sigue a la velocidad horizontal con un suavizado, así
      // la tarjeta "cuelga" al moverla rápido y se endereza al frenar.
      const velocity = p.x - p.lastX;
      p.lastX = p.x;
      p.tilt += (clamp(velocity * 0.8, -MAX_TILT_DEG, MAX_TILT_DEG) - p.tilt) * 0.15;
      if (overlayRef.current) applyTransform(overlayRef.current);
      p.frame = requestAnimationFrame(tick);
    };

    const onMove = (moveEvent: PointerEvent) => {
      if (!started) {
        if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < DRAG_THRESHOLD_PX) return;
        started = true;
        const rect = card.getBoundingClientRect();
        Object.assign(p, { grabX: startX - rect.left, grabY: startY - rect.top, lastX: moveEvent.clientX, tilt: 0, active: true });
        suppressClickRef.current = true;
        window.getSelection()?.removeAllRanges();
        setSession({
          ticket,
          fromStatus: status,
          width: rect.width,
          height: rect.height,
          grabX: p.grabX,
          grabY: p.grabY,
          phase: 'dragging',
        });
        p.frame = requestAnimationFrame(tick);
      }
      p.x = moveEvent.clientX;
      p.y = moveEvent.clientY;
      setOverStatus(columnAt(p.x, p.y));
    };

    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKeyDown);
      if (!started) return;
      cancelAnimationFrame(p.frame);
      p.active = false;
      // El click que dispara el navegador al soltar no debe abrir la ficha.
      setTimeout(() => {
        suppressClickRef.current = false;
      });
      const target = commit ? columnAt(p.x, p.y) : null;
      setOverStatus(null);
      if (target && target !== status) {
        onDropRef.current(ticket, status, target);
        setSession((current) => current && { ...current, phase: 'dropping' });
      } else {
        setSession((current) => current && { ...current, phase: 'cancelling' });
      }
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') finish(false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKeyDown);
  };

  // Aterrizaje: la tarjeta flotante vuela hasta la tarjeta real (oculta
  // mientras tanto) y recién al llegar se desmonta.
  const phase = session?.phase;
  const ticketId = session?.ticket.id;
  useLayoutEffect(() => {
    if ((phase !== 'dropping' && phase !== 'cancelling') || !ticketId) return;
    const overlay = overlayRef.current;
    const target = boardRef.current?.querySelector<HTMLElement>(`[data-ticket-id="${CSS.escape(ticketId)}"]`);
    const done = () => {
      if (phase === 'dropping') setSettledTicketId(ticketId);
      setSession(null);
    };
    if (!overlay || !target) {
      done();
      return;
    }
    const rect = target.getBoundingClientRect();
    const from = overlay.style.transform;
    const to = `translate3d(${rect.left}px, ${rect.top}px, 0) rotate(0deg)`;
    overlay.style.transform = to;
    const animation = overlay.animate([{ transform: from }, { transform: to }], {
      duration: prefersReducedMotion() ? 0 : SETTLE_MS,
      easing: EASE_OUT,
    });
    animation.onfinish = done;
    return () => {
      animation.onfinish = null;
    };
  }, [phase, ticketId, boardRef]);

  return {
    session,
    /** Columna destino válida bajo el cursor (nunca la de origen). */
    overStatus: session && overStatus !== session.fromStatus ? overStatus : null,
    settledTicketId,
    clearSettled: () => setSettledTicketId(null),
    overlayRef: setOverlayRef,
    registerColumn,
    handleCardPointerDown,
    /** `true` si el click viene de soltar un arrastre y hay que ignorarlo. */
    shouldIgnoreClick: () => suppressClickRef.current,
  };
}

/**
 * Animación FLIP de las tarjetas que cambian de posición dentro de su misma
 * columna (al sacar una tarjeta, al llegar datos nuevos): en vez de saltar,
 * se deslizan a su lugar nuevo. Las posiciones se miden relativas al
 * contenido de la columna, así el scroll del usuario no cuenta como movimiento.
 * Devuelve `snapshot` para fijar el "antes" justo antes de un cambio propio.
 */
export function useCardReflow(boardRef: RefObject<HTMLElement | null>, trigger: unknown) {
  const positionsRef = useRef(new Map<string, { status: string; top: number }>());

  const measure = useCallback(() => {
    const positions = new Map<string, { status: string; top: number; element: HTMLElement }>();
    boardRef.current?.querySelectorAll<HTMLElement>('[data-ticket-id]').forEach((element) => {
      const body = element.parentElement;
      if (!body) return;
      const top = element.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
      positions.set(element.dataset.ticketId as string, { status: element.dataset.status ?? '', top, element });
    });
    return positions;
  }, [boardRef]);

  const snapshot = useCallback(() => {
    positionsRef.current = measure();
  }, [measure]);

  useLayoutEffect(() => {
    const next = measure();
    if (!prefersReducedMotion()) {
      for (const [id, { status, top, element }] of next) {
        const previous = positionsRef.current.get(id);
        const delta = previous && previous.status === status ? previous.top - top : 0;
        if (Math.abs(delta) < 1) continue;
        element.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], {
          duration: SETTLE_MS,
          easing: EASE_OUT,
        });
      }
    }
    positionsRef.current = next;
  }, [trigger, measure]);

  return snapshot;
}
