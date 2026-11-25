import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Contrato visual: DashboardLayout ya aporta el margen externo Kora.
// Cotizaciones no debe introducir otro max-width ni centrar la página.
const cssFile = [
  resolve(process.cwd(), 'src/modules/estimation/pages/QuotationWorkspacePage.module.css'),
  resolve(process.cwd(), 'apps/web/src/modules/estimation/pages/QuotationWorkspacePage.module.css'),
].find((candidate) => existsSync(candidate));
if (!cssFile) throw new Error('No se encontró QuotationWorkspacePage.module.css.');

const css = readFileSync(cssFile, 'utf8');

describe('Cotización · margen natural del layout Kora', () => {
  it('ocupa el ancho disponible sin contenedor centrado ni padding lateral propio', () => {
    const rules = Array.from(css.matchAll(/\.page\s*\{([^}]+)\}/g),
      (match) => match[1] ?? '');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.join(' ')).not.toMatch(/width\s*:\s*min\s*\(/);
    expect(rules.join(' ')).not.toMatch(/margin\s*:\s*0\s+auto/);
    expect(rules.join(' ')).not.toMatch(/padding-(?:left|right|inline)\s*:/);
    expect(rules.join(' ')).not.toMatch(/max-width\s*:\s*\d/);
    expect(rules.some((rule) => /width\s*:\s*100%/.test(rule))).toBe(true);
  });

  it('no desplaza artificialmente el breadcrumb y mantiene la distribución lateral', () => {
    const breadcrumbs = Array.from(css.matchAll(/\.breadcrumb\s*\{([^}]+)\}/g),
      (match) => match[1] ?? '');
    expect(breadcrumbs.join(' ')).not.toMatch(/margin\s*:\s*0\s+0\s+2px\s+16px/);
    expect(css).toMatch(/\.layout\s*\{grid-template-columns:minmax\(0,1fr\) 330px;/);
    expect(css).toContain('.sidebar{position:sticky;top:16px;');
  });
});
