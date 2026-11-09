import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const base = [
  resolve(process.cwd(), 'src/modules/estimation'),
  resolve(process.cwd(), 'apps/web/src/modules/estimation'),
].find((directory) => existsSync(resolve(directory, 'pages/QuotationWorkspacePage.tsx')));
if (!base) throw new Error('No se encontró la calculadora de cotizaciones.');

const read = (path: string) => readFileSync(resolve(base, path), 'utf8');
const page = read('pages/QuotationWorkspacePage.tsx');
const css = read('pages/QuotationWorkspacePage.module.css');
const aiStyles = read('components/QuotationAiReviewBanner.module.css');
const footer = read('components/QuotationDraftSaveBar.tsx');

describe('Iteración 4 · controles nativos y flujos de cotización', () => {
  it('representa versiones mediante Button y conserva selección y títulos accesibles', () => {
    expect(page).toMatch(/<Button key=\{version\.id\} size="sm"/);
    expect(page).toContain("variant={selected?.id === version.id ? 'secondary' : 'outline'}");
    expect(page).toContain("aria-label={'Abrir versión ' + version.versionNumber}");
    expect(page).toContain('aria-pressed={selected?.id === version.id}');
    expect(page).toContain('onClick={() => void selectVersion(version.id)}');
    expect(page).toContain("if (dirty && !await confirm({ title: 'Descartar cambios'");
  });

  it('usa acciones secundarias Kora sin perder creación IA, copia o versión en blanco', () => {
    expect(page).toContain('onClick={() => void newVersion(selected?.id)}');
    expect(page).toContain('onClick={() => void newVersion()}');
    expect(page).toContain('setNewQuotationOpen(true)');
    expect(page).toContain('setRoleMappingOpen(true)');
    expect(page).not.toContain('className={styles.textAction}');
    expect(page).not.toContain('className={styles.mappingLink}');
    expect((page.match(/<Button variant="tertiary" size="sm"/g) ?? []).length)
      .toBeGreaterThanOrEqual(4);
  });

  it('elimina estilos de botones de versión que sobrescribían las variantes nativas', () => {
    expect(css).not.toContain('.versions .selected');
    expect(css).not.toContain('.versions .textAction');
    expect(css).not.toContain('.versions .aiAction');
    expect(css).not.toContain('.aiBanner');
    expect(css).not.toContain('.mappingLink');
    expect(aiStyles).not.toMatch(/#[\da-fA-F]{3,8}\b/);
    expect(aiStyles).not.toContain('button:last-child');
  });

  it('no reinicia el modal de traspaso cuando cambia la revisión al aprobar', () => {
    // La aprobación incrementa revision y actualiza la query; la segunda
    // confirmación de traspaso conserva su estado usando la identidad de versión.
    // Solo el ciclo comercial debe conservar identidad entre revisiones.
    // Otros paneles (preflight, mapeo y planificación) sí necesitan reconstruirse.
    const lifecycle = page.match(/<QuotationCommercialLifecycleCard\s+([\s\S]*?)\/>/)?.[1];
    expect(lifecycle).toBeDefined();
    expect(lifecycle).toContain('key={selected.id}');
    expect(lifecycle).not.toContain("key={selected.id + ':' + selected.revision}");
  });

    it('conserva footer único y los mensajes con useToast sin tocar persistencia', () => {
    expect(page).toContain('<QuotationDraftSaveBar');
    expect(page).toContain('saveDraft.mutateAsync');
    expect(page).toContain('await lifecycle.acceptAi.mutateAsync');
    expect(page).toContain('toast.success');
    expect(footer).toContain('<Button variant="primary" size="sm"');
    expect(footer).toContain('disabled={!dirty}');
  });
});
