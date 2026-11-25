import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, tokenStore } from './api-client';

afterEach(() => {
  tokenStore.set(null);
  vi.unstubAllGlobals();
});

describe('Descarga autenticada de archivos', () => {
  it('recupera un PDF como Blob con el token de acceso', async () => {
    tokenStore.set('test-token');
    const file = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    const blob = vi.fn().mockResolvedValue(file);
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, blob });
    vi.stubGlobal('fetch', fetch);
    expect(await api.getBlob('/support-invoices/id/attachment')).toBe(file);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/support-invoices/id/attachment'), expect.objectContaining({
      headers: { Authorization: 'Bearer test-token' },
    }));
  });

  it('renueva un token caducado y conserva la respuesta binaria en el reintento', async () => {
    tokenStore.set('expired-test-token');
    const file = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    const fetch = vi.fn()
      .mockResolvedValueOnce({ status: 401 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tokens: { accessToken: 'renewed-test-token' } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, blob: async () => file });
    vi.stubGlobal('fetch', fetch);
    expect(await api.getBlob('/support-invoices/id/attachment')).toBe(file);
    expect(tokenStore.get()).toBe('renewed-test-token');
  });

  it('propaga errores de API sin convertirlos en un PDF', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404,
      text: async () => JSON.stringify({ code: 'NOT_FOUND', kind: 'not_found', message: 'PDF no encontrado.' }),
    }));
    await expect(api.getBlob('/support-invoices/id/attachment')).rejects.toThrow('PDF no encontrado.');
  });
});
