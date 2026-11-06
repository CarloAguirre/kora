import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const file = [
  resolve(process.cwd(), 'src/modules/estimation/pages/QuotationWorkspacePage.tsx'),
  resolve(process.cwd(), 'apps/web/src/modules/estimation/pages/QuotationWorkspacePage.tsx'),
].find((candidate) => existsSync(candidate));
if (!file) throw new Error('No se encontró la página de cotización.');

const page = readFileSync(file, 'utf8');

describe('Cotización: acciones de cambios y feedback real', () => {
  it('el único control de guardado está en el footer y conserva la mutación original', () => {
    expect(page).toContain('<QuotationDraftSaveBar');
    expect(page).toContain('dirty={editable && dirty}');
    expect(page).toContain('onSave={() => void save()}');
    expect(page).toContain('saveDraft.mutateAsync');
    expect(page).not.toContain('Guardar borrador');
  });
  it('el descarte restaura el snapshot persistido sin enviar peticiones', () => {
    expect(page).toContain('setForm(fromVersion(selected));');
    expect(page).toContain('setDirty(false);');
    expect(page).toContain('onDiscard={discardChanges}');
    // Descartar una asignación automática no debe dispararla de nuevo.
    expect(page).toContain('dismissedAutomaticMapping.current = selected.id');
  });
  it('las respuestas de acciones son snackbars Kora y no alertas duplicadas', () => {
    expect(page).toContain('const toast = useToast();');
    expect(page).toContain("toast.success('Cambios guardados");
    expect(page).not.toContain('{notice && <p');
    expect(page).not.toContain('{error && <p');
    expect(page).not.toContain('{sampleError && <p');
  });
});
