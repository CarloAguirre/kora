import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = [
  resolve(process.cwd(), 'src/modules/estimation/pages/QuotationWorkspacePage.tsx'),
  resolve(process.cwd(), 'apps/web/src/modules/estimation/pages/QuotationWorkspacePage.tsx'),
].find((file) => existsSync(file));
if (!source) throw new Error('No se encontró la página comercial.');
const page = readFileSync(source, 'utf8');

describe('Revisión de la propuesta Gemini · flujo UI + persistencia', () => {
  it('conecta la aceptación a la mutación real, sin confirmar dos veces', () => {
    expect(page).toContain('onAccept={() => void acceptAiProposal()}');
    expect(page).toContain('await lifecycle.acceptAi.mutateAsync');
    expect(page).not.toContain("title: 'Aceptar propuesta de Gemini'");
  });
  it('no modifica el borrador antes de elegir ajustar y preserva revisión', () => {
    expect(page).toContain("adjustingAiVersionId !== selected.id) return;");
    expect(page).toContain('onAdjust={() => setAdjustingAiVersionId(selected.id)}');
    expect(page).toContain('revision: selected.revision');
  });
  it('apoya ajuste con guardado y descarte sin confundir aprobación del cliente', () => {
    expect(page).toContain('onDiscard={discardChanges}');
    expect(page).toContain('onSave={() => void save()}');
    expect(page).toContain('setAdjustingAiVersionId(null);');
    expect(page).toContain('toast.success(\'Propuesta IA aceptada.');
  });
  it('el aviso de aceptación queda vinculado a la versión correcta', () => {
    expect(page).toContain('recentAiAcceptance?.versionId === selected.id');
    expect(page).toContain("selected.origin === 'ai'");
  });
});
