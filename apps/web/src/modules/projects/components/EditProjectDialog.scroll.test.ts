import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Contratos CSS de desplazamiento; jsdom no mide scroll real. */
const src = resolve(process.cwd(), 'src');
const globalCss = readFileSync(resolve(src, 'styles/global.css'), 'utf8');
const layoutCss = readFileSync(resolve(src, 'shared/components/layout/DashboardLayout.module.css'), 'utf8');
const modalCss = readFileSync(resolve(src, 'shared/components/ui/Modal.module.css'), 'utf8');

describe('Editar proyecto: solo el cuerpo del modal puede desplazarse', () => {
  it('oculta el scrollbar de la raíz mientras algún diálogo nativo esté abierto', () => {
    expect(globalCss).toMatch(/html:has\(dialog\[open\]\),\s*body:has\(dialog\[open\]\)\s*\{[^}]*overflow:\s*hidden;/s);
  });

  it('oculta el scroll de la vista principal y lo restablece sin mutar estilos inline', () => {
    expect(layoutCss).toMatch(/\.content:has\(dialog\[open\]\)\s*\{[^}]*overflow-y:\s*hidden;/s);
  });

  it('conserva cabecera y pie visibles, con desplazamiento solo en el cuerpo del drawer', () => {
    expect(modalCss).toMatch(/\.dialog\.bodyScrollOnly\[open\]\s*\{[^}]*overflow:\s*hidden;/s);
    expect(modalCss).toMatch(/\.dialog\.bodyScrollOnly\[open\] \.body\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
    expect(modalCss).toMatch(/\.dialog\.side\.bodyScrollOnly\[open\]\s*\{[^}]*height:\s*100dvh;[^}]*max-height:\s*100dvh;/s);
  });
});
