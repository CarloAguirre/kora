import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * El runner ejecuta Vitest desde apps/web (pnpm --filter @kora/web).
 * Vite transforma import.meta.url en una URL virtual sin esquema file,
 * por lo que leemos desde el directorio real del paquete, sin CSS Modules.
 */
const cssDir = resolve(process.cwd(), 'src/modules/projects/components');
const phaseCss = readFileSync(resolve(cssDir, 'ProjectModulesCard.module.css'), 'utf8');
const drawerCss = readFileSync(resolve(cssDir, 'SegmentDrawer.module.css'), 'utf8');
const ganttCss = readFileSync(resolve(cssDir,
  '../../client-portal/components/PhaseRoadmap.module.css'), 'utf8');
const progressCss = readFileSync(resolve(cssDir,
  'ProjectExecutionProgressCard.module.css'), 'utf8');
const pillCss = readFileSync(resolve(cssDir,
  '../../../shared/components/ui/PillSwitcher.module.css'), 'utf8');
const dataTableCss = readFileSync(resolve(cssDir,
  '../../../shared/components/ui/DataTable.module.css'), 'utf8');

/**
 * Contratos estáticos de estilos que jsdom no puede medir visualmente.
 * Complementar con revisión real a 320, 375, 768 y 1280 px (UI-4).
 */
describe('Roadmap UI-3: tokens y scroll local', () => {
  it('consume la superficie, cabecera y filas del DataTable nativo', () => {
    expect(phaseCss).toMatch(/\.operationalTasks\s*\{[^}]*min-width:\s*0;/s);
    expect(dataTableCss).toMatch(/\.container\s*\{[^}]*overflow:\s*auto;/s);
    expect(dataTableCss).toMatch(/\.headerCell\s*\{[^}]*background:\s*var\(--kora-blue-surface-soft\);/s);
    expect(dataTableCss).toMatch(/\.row:nth-child\(even\)\s*\{[^}]*background:\s*var\(--kora-surface-alt\);/s);
  });

  it('usa el foco visible de DataTable y mantiene ancho mínimo propio', () => {
    expect(dataTableCss).toMatch(/\.container:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--kora-blue-600\);/s);
    expect(dataTableCss).toMatch(/\.table\s*\{[^}]*min-width:\s*720px;/s);
  });

  it('usa tokens Kora y reorganiza el drawer a anchos reducidos', () => {
    expect(drawerCss).toMatch(/--drawer-ink:\s*var\(--kora-navy\);/);
    expect(drawerCss).toMatch(/--drawer-line:\s*var\(--kora-border-subtle\);/);
    expect(drawerCss).toMatch(/\.tasksHeading\s*\{[^}]*flex-wrap:\s*wrap;/s);
    expect(drawerCss).toMatch(/@media \(max-width: 560px\)\s*\{[\s\S]*?\.metrics\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s);
    expect(drawerCss).toMatch(/@media \(max-width: 380px\)\s*\{[\s\S]*?\.metrics\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s);
  });

  it('protege el foco del scroll local y el scroll/sticky del Gantt compartido', () => {
    expect(dataTableCss).toMatch(/\.container:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--kora-blue-600\);/s);
    expect(ganttCss).toMatch(/\.operationalGanttViewport\s*\{[^}]*overflow-x:\s*auto;/s);
    expect(ganttCss).toMatch(/\.operationalGanttViewport\s*\{[^}]*overscroll-behavior-x:\s*contain;/s);
    expect(ganttCss).toMatch(/\.operationalStickyLabel,\s*\.operationalBlockLabel\s*\{[^}]*position:\s*sticky;/s);
    expect(ganttCss).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.operationalGantt\s*\{[^}]*transition:\s*none;/s);
  });

  it('restaura la barra principal de 18px y las barras Gantt de 24px de master', () => {
    expect(progressCss).toMatch(/\.root \.projectTimeline\s*\{[^}]*height:\s*18px;/s);
    expect(progressCss).toMatch(/\.root \.projectActualFill\s*\{[^}]*linear-gradient\(90deg, var\(--kora-lime-mid\), var\(--kora-lime\)\)/s);
    expect(ganttCss).toMatch(/\.operationalLine\s*\{[^}]*min-height:\s*46px;/s);
    expect(ganttCss).toMatch(/\.operationalBar\s*\{[^}]*top:\s*11px;[^}]*height:\s*24px;/s);
    expect(ganttCss).toMatch(/\.operationalBarSelected\s*\{[^}]*outline:\s*2px solid #4c7ef3;/s);
  });

  it('el selector reutilizado de Bitácora tiene el estado activo lima original', () => {
    expect(pillCss).toMatch(/\.group\s*\{[^}]*border:\s*1px solid var\(--kora-blue-200\);/s);
    expect(pillCss).toMatch(/\.selected,\s*\.selected:hover\s*\{[^}]*background:\s*var\(--kora-lime\);/s);
  });

});
