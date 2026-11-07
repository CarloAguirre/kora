import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Auditoría de los componentes directamente integrados en la calculadora.
// No impone reglas al resto de los módulos de Kora ni al color de equipos
// definido en la lógica de negocio.
const dir = [
  resolve(process.cwd(), 'src/modules/estimation'),
  resolve(process.cwd(), 'apps/web/src/modules/estimation'),
].find((path) => existsSync(resolve(path, 'pages/QuotationWorkspacePage.tsx')));
if (!dir) throw new Error('No se encontró el módulo de estimación de Kora.');
const read = (path: string) => readFileSync(resolve(dir, path), 'utf8');

const css = [
  'pages/QuotationWorkspacePage.module.css',
  'components/QuotationCommercialSummary.module.css',
  'components/QuotationCommercialLifecycleCard.module.css',
  'components/QuotationTeamsWorkspace.module.css',
  'components/QuotationPhaseWorkspace.module.css',
  'components/QuotationCommercialSections.module.css',
  'components/QuotationAiReviewBanner.module.css',
  'components/QuotationDraftSaveBar.module.css',
];

describe('Iteración 5 · auditoría transversal del sistema de diseño Kora', () => {
  it.each(css)('%s no introduce colores hexadecimales ajenos a los tokens', (path) => {
    const styles = read(path);
    expect(styles).not.toMatch(/#[\da-fA-F]{3,8}\b/);
    expect(styles).toContain('var(--kora-');
  });

  it('elimina controles estilizados manualmente de la cabecera y los comerciales', () => {
    const page = read('pages/QuotationWorkspacePage.tsx');
    const commercial = read('components/QuotationCommercialSections.tsx');
    const phases = read('components/QuotationPhaseWorkspace.tsx');
    expect(page).not.toMatch(/<button\b/);
    expect(commercial).not.toMatch(/<(?:button|input|select)\b/);
    expect(phases).not.toMatch(/<button\b/);
    expect(page).toContain('aria-pressed={selected?.id === version.id}');
    expect(page).toContain("if (dirty && !await confirm({ title: 'Descartar cambios'");
    expect(page).toContain('<QuotationDraftSaveBar');
    expect(page).toContain('toast.success');
  });

  it('preserva el layout de escritorio, scroll y adaptación responsive', () => {
    const pageCss = read(css[0]!);
    const edtCss = read('components/QuotationPhaseWorkspace.module.css');
    const teamCss = read('components/QuotationTeamsWorkspace.module.css');
    const footerCss = read('components/QuotationDraftSaveBar.module.css');
    expect(pageCss).toContain('.layout{grid-template-columns:minmax(0,1fr) 330px;');
    expect(pageCss).toContain('.sidebar{position:sticky;top:16px;');
    expect(pageCss).toContain('@media(max-width:980px)');
    expect(edtCss).toContain('.tableScroll{width:100%;overflow-x:auto;');
    expect(edtCss).toContain('.tasksHeader,.taskRow{display:grid;');
    expect(teamCss).toContain('.tableScroll{overflow-x:auto;');
    expect(footerCss).toContain('position: sticky');
    expect(footerCss).toContain('env(safe-area-inset-bottom)');
  });

  it('no conserva overrides obsoletos que compitan con Button/SegmentedControl', () => {
    const page = read('pages/QuotationWorkspacePage.module.css');
    const teams = read('components/QuotationTeamsWorkspace.module.css');
    const edt = read('components/QuotationPhaseWorkspace.module.css');
    const lifecycle = read('components/QuotationCommercialLifecycleCard.module.css');
    expect(page).not.toContain('.sidebar button');
    expect(page).not.toContain('.versions .selected');
    expect(teams).not.toContain(':global([role="radio"]');
    expect(teams).not.toContain('.weeklyTable');
    expect(edt).not.toContain('.templateLink');
    expect(lifecycle).not.toContain('.v5Actions .v5Approve');
    expect(lifecycle).not.toContain('.v5Actions .v5Send');
    expect(lifecycle).toContain('.v5Actions button{width:100%}');
  });

  it('la aprobación y el traspaso mantienen acciones nativas y los guards de negocio', () => {
    const lifecycle = read('components/QuotationCommercialLifecycleCard.tsx');
    const edt = read('components/QuotationPhaseWorkspace.tsx');
    expect(lifecycle).toContain('<Button variant="secondary"');
    expect(lifecycle).toContain('<Button variant="outline"');
    expect(lifecycle).toContain('await actions.approveClient.mutateAsync');
    expect(lifecycle).toContain('await actions.transferApproved.mutateAsync');
    expect(lifecycle).toContain('toast.error');
    expect(edt).toContain('<Button variant="ghost" size="icon" className={styles.deleteTask}');
  });
});
