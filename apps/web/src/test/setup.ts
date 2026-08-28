import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * jsdom no implementa la API de `<dialog>`.
 *
 * Se añaden las tres funciones mínimas para que los componentes que usan
 * `<dialog>` —como `Modal`— se puedan probar. No se sustituye el componente por
 * un doble: se prueba el componente real con el entorno completado.
 */
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
  HTMLDialogElement.prototype.show ??= function show(this: HTMLDialogElement) {
    this.open = true;
  };
}
