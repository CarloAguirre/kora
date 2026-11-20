import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { QuotationVersion } from '@kora/contracts';
import { QuotationAiReviewBanner } from './QuotationAiReviewBanner';
import badgeStyles from '@/shared/components/ui/Badge.module.css';
import buttonStyles from '@/shared/components/ui/Button.module.css';

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
const requiredClass = (name: string, className?: string): string => {
  if (!className) throw new Error('Falta clase UI de Kora: ' + name);
  return className;
};

describe('Revisión IA · estados fieles al prototipo', () => {
  it('utiliza las variantes nativas de Button para editar y aceptar', () => {
    renderBanner();
    expect(screen.getByRole('button', { name: 'Ajustar antes de aceptar' }))
      .toHaveClass(requiredClass('Button.outline', buttonStyles.outline));
    expect(screen.getByRole('button', { name: 'Usar tal cual' }))
      .toHaveClass(requiredClass('Button.secondary', buttonStyles.secondary));
  });
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
    expect(screen.getByText(/Propuesta del agente IA, aceptada por Mangel Tort/))
      .toHaveClass(requiredClass('Badge.success', badgeStyles.success));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
