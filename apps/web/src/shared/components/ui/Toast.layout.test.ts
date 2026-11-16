import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(),
  process.cwd().endsWith('apps/web') ? 'src/shared/components/ui/Toast.module.css' :
    'apps/web/src/shared/components/ui/Toast.module.css'), 'utf8');

describe('Toast dentro de diálogo nativo', () => {
  it('mantiene ancho legible y permite que el texto ocupe el espacio restante', () => {
    expect(source).toMatch(/\.container\s*\{[^}]*width:\s*min\(420px/s);
    expect(source).toMatch(/\.toast\s*\{[^}]*width:\s*100%/s);
    expect(source).toMatch(/\.message\s*\{[^}]*min-width:\s*0/s);
    expect(source).toMatch(/overflow-wrap:\s*break-word/);
  });
});