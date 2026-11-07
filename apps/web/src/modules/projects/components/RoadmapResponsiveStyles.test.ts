import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Vitest/Vite procesa los .module.css como objetos de clases, incluso si se
 * importa con ?raw. Para validar el CSS fuente necesitamos leerlo como texto
 * desde el sistema de archivos, independientemente del pipeline de estilos.
 */
const phaseCss = readFileSync(new URL('./ProjectModulesCard.module.css', import.meta.url), 'utf8');
const drawerCss = readFileSync(new URL('./SegmentDrawer.module.css', import.meta.url), 'utf8');

/**
 * Contratos estáticos de estilos que jsdom no puede medir visualmente.
 * Complementar con revisión real a 320, 375, 768 y 1280 px (UI-4).
 */
describe('Roadmap UI-3: tokens y scroll local', () => {
  it('mantiene la tabla ancha dentro de su propio scroll, sin mover el Gantt', () => {
    expect(phaseCss).toMatch(/\.operationalContent\s*\{[^}]*min-width:\s*0;/s);
    expect(phaseCss).toMatch(/\.operationalTasks\s*\{[^}]*min-width:\s*0;/s);
    expect(phaseCss).toMatch(/\.operationalTaskScroll\s*\{[^}]*overflow-x:\s*auto;/s);
    expect(phaseCss).toMatch(/\.operationalTaskScroll\s*\{[^}]*overscroll-behavior-x:\s*contain;/s);
    expect(phaseCss).toMatch(/\.operationalTaskTable\s*\{[^}]*min-width:\s*760px;/s);
  });

  it('reserva ancho de acciones solo cuando existe esa columna', () => {
    expect(phaseCss).toMatch(/\.operationalTaskTable th\[aria-label="Acciones"\]\s*\{[^}]*min-width:\s*118px;/s);
    expect(phaseCss).not.toMatch(/\.operationalTaskTable th:last-child\s*\{/);
    expect(phaseCss).toMatch(/\.operationalTaskTable \.operationalTaskTitle\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
  });

  it('usa tokens Kora y reorganiza el drawer a anchos reducidos', () => {
    expect(drawerCss).toMatch(/--drawer-ink:\s*var\(--kora-navy\);/);
    expect(drawerCss).toMatch(/--drawer-line:\s*var\(--kora-border-subtle\);/);
    expect(drawerCss).toMatch(/\.tasksHeading\s*\{[^}]*flex-wrap:\s*wrap;/s);
    expect(drawerCss).toMatch(/@media \(max-width: 560px\)\s*\{[\s\S]*?\.metrics\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s);
    expect(drawerCss).toMatch(/@media \(max-width: 380px\)\s*\{[\s\S]*?\.metrics\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s);
  });
});
