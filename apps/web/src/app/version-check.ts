import type { router as appRouter } from './router/routes';

/**
 * Detección de despliegues nuevos.
 *
 * Una SPA descarga el `index.html` una sola vez: quien deja la pestaña abierta
 * sigue usando el bundle viejo indefinidamente, aunque ya se haya desplegado
 * otro. Para no depender de que la persona haga Ctrl + R, cada cierto tiempo
 * (y al volver a la pestaña) se consulta `version.json`, que el build genera
 * con el mismo identificador que lleva incrustado el bundle.
 *
 * Si no coinciden, NO se recarga en el acto — podría haber un formulario a
 * medio llenar —, sino en la siguiente navegación: la persona ya está saliendo
 * de esa pantalla, y la recarga se confunde con un cambio de página normal.
 */

const CHECK_INTERVAL_MS = 5 * 60_000;
const VERSION_URL = `${import.meta.env.BASE_URL}version.json`;

export function startVersionCheck(router: typeof appRouter): void {
  // En desarrollo no hay `version.json` y Vite ya recarga solo.
  if (!import.meta.env.PROD) return;

  let updateAvailable = false;

  async function check() {
    if (updateAvailable) return;
    try {
      const response = await fetch(VERSION_URL, { cache: 'no-store' });
      if (!response.ok) return;
      const { version } = (await response.json()) as { version?: string };
      if (version && version !== __APP_VERSION__) updateAvailable = true;
    } catch {
      // Sin red o servidor caído: se reintenta en la próxima vuelta.
    }
  }

  setInterval(check, CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });

  let currentPath = router.state.location.pathname;
  router.subscribe((state) => {
    const nextPath = state.location.pathname;
    if (nextPath === currentPath) return;
    currentPath = nextPath;
    // El router ya dejó la URL en la página de destino: recargar descarga
    // el `index.html` nuevo directamente ahí.
    if (updateAvailable) window.location.reload();
  });
}
