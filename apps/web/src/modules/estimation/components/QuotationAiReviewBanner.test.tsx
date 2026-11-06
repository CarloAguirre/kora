import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { QuotationVersion } from '@kora/contracts';
import { QuotationAiReviewBanner } from './QuotationAiReviewBanner';

const pending = {
  id: '0777e456-fd76-445e-83f1-afc25061c108',
  origin: 'ai',
  aiReviewStatus: 'pending',
  draft: { aiPoc: { answers: [{ value: 'Sí' }], proposal: { documentsAnalyzed: 4 } } },
} as unknown as QuotationVersion;
const callbacks = { onAdjust: vi.fn(), onAccept: vi.fn(), onDiscard: vi.fn(), onSave: vi.fn() };
function renderBanner(overrides: Record<string, unknown> = {}) {
  return render(<QuotationAiReviewBanner
    version={pending} adjusting={false} editable dirty={false}
    saving={false} accepting={false}
    {...callbacks} {...overrides} />);
}
describe('Revisión IA · estados fieles al prototipo', () => {
  it('ofrece ajustar o aceptar la propuesta original sin confundirlo con aprobación del cliente', () => {
    renderBanner();
    expect(screen.getByText(/4 documentos y 1 respuesta del cuestionario/)).toBeInTheDocument();
    expect(screen.queryByText('Guardar ajustes')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar antes de aceptar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Usar tal cual' }));
    expect(callbacks.onAdjust).toHaveBeenCalledOnce();
    expect(callbacks.onAccept).toHaveBeenCalledOnce();
  });
  it('al ajustar muestra acciones y no guarda sin modificaciones', () => {
    renderBanner({ adjusting: true });
    expect(screen.getByText(/Estás ajustando la propuesta/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar ajustes' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    expect(callbacks.onDiscard).toHaveBeenCalledOnce();
  });
  it('habilita guardar modificaciones pendientes', () => {
    renderBanner({ adjusting: true, dirty: true });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    expect(callbacks.onSave).toHaveBeenCalledOnce();
  });
  it('aceptada se presenta como confirmación compacta sin botones', () => {
    renderBanner({ version: { ...pending, aiReviewStatus: 'accepted' }, acceptedBy: 'Mangel Tort' });
    expect(screen.getByText(/Propuesta del agente IA, aceptada por Mangel Tort/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
